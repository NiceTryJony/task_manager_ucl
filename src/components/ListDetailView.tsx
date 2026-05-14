// 'use client'

// import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
// import { gsap } from 'gsap'
// import { createSwapy, utils } from 'swapy'
// import { supabase } from '@/lib/supabase'
// import { useTaskStore } from '@/lib/store'
// import { useTelegram } from '@/hooks/useTelegram'
// import { PRIORITY_CONFIG, cn } from '@/lib/utils'
// import {
//   ArrowLeft, Plus, GripVertical, Search, X, SortAsc,
//   Calendar, CheckCircle2, Eye, Sun, Moon, ArrowUpDown,
// } from 'lucide-react'
// import { TaskSheet }       from '@/components/TaskSheet'
// import { ViewerTaskSheet } from '@/components/ViewerTaskSheet'
// import { ContextMenu, type ContextMenuItem } from '@/components/ContextMenu'
// import { Confetti }        from '@/components/Confetti'
// import type { Task, TaskStatus, Priority, MemberRole } from '@/types'
// import { toast } from 'sonner'
// import { usePending }  from '@/hooks/usePending'
// import { useTheme }    from '@/lib/theme-context'
// import { useI18n }     from '@/lib/i18n-context'

// // ─────────────────────────────────────────────────────────────
// //  Types
// // ─────────────────────────────────────────────────────────────
// interface Props { onBack: () => void }

// type SortKey       = 'position' | 'due_at' | 'priority' | 'created_at'
// type FilterKey     = TaskStatus | 'all' | 'archived'
// type ReorderStatus = 'idle' | 'pending' | 'saving'

// type SlotItemEntry = { slot: string; item: string | null }

// const PRIORITY_ORDER: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

// // ─────────────────────────────────────────────────────────────
// //  ListDetailView
// // ─────────────────────────────────────────────────────────────
// export function ListDetailView({ onBack }: Props) {
//   const { theme, toggleTheme } = useTheme()
//   const { t } = useI18n()

//   const STATUS_TABS: { key: FilterKey; label: string }[] = [
//     { key: 'all',         label: t('filter_all')     },
//     { key: 'todo',        label: t('filter_todo')    },
//     { key: 'in_progress', label: t('filter_doing')   },
//     { key: 'done',        label: t('filter_done')    },
//     { key: 'archived',    label: t('filter_archive') },
//   ]

//   const { user, haptic } = useTelegram()
//   const { lists, tasks, activeListId, setTasks, updateTask, removeTask, reorderTasks } = useTaskStore()
//   const list = lists.find(l => l.id === activeListId)

//   // ── UI state ────────────────────────────────────────────────
//   const [myRole,       setMyRole]       = useState<MemberRole>('viewer')
//   const [filter,       setFilter]       = useState<FilterKey>('all')
//   const [sortKey,      setSortKey]      = useState<SortKey>('position')
//   const [loading,      setLoading]      = useState(true)
//   const [searchQuery,  setSearchQuery]  = useState('')
//   const [showSearch,   setShowSearch]   = useState(false)
//   const [showSort,     setShowSort]     = useState(false)
//   const [activeTask,   setActiveTask]   = useState<Task | null>(null)
//   const [showCreate,   setShowCreate]   = useState(false)
//   const [isOnline,     setIsOnline]     = useState(true)
//   const [showConfetti, setShowConfetti] = useState(false)
//   const [contextMenu,  setContextMenu]  = useState<{ task: Task; x: number; y: number } | null>(null)
//   const [isPulling,    setIsPulling]    = useState(false)
//   const [viewerTask,   setViewerTask]   = useState<Task | null>(null)

//   // ── Reorder debounce state ──────────────────────────────────
//   const [reorderStatus,    setReorderStatus]    = useState<ReorderStatus>('idle')
//   const reorderDebounceRef = useRef<ReturnType<typeof setTimeout>>()
//   const pendingOrderRef    = useRef<Task[] | null>(null)  // new order (active tasks only)
//   const originalOrderRef   = useRef<Task[] | null>(null)  // original for rollback
//   const wantsToGoBackRef   = useRef(false)

//   // ── Swapy refs ──────────────────────────────────────────────
//   const swapyRef     = useRef<ReturnType<typeof createSwapy> | null>(null)
//   const containerRef = useRef<HTMLDivElement>(null)

//   // ── Swapy slot-item mapping (drives render order) ───────────
//   const [slotItemMap, setSlotItemMap] = useState<SlotItemEntry[]>([])

//   // ── Other refs ──────────────────────────────────────────────
//   const pageRef    = useRef<HTMLDivElement>(null)
//   const listRef    = useRef<HTMLDivElement>(null)
//   const searchRef  = useRef<HTMLInputElement>(null)
//   const pullStartY       = useRef(0)
//   const wasDone          = useRef(false)
//   const fetchDebounceRef = useRef<ReturnType<typeof setTimeout>>()
//   const abortRef         = useRef<AbortController>()

//   // ── Derived task lists ──────────────────────────────────────
//   const allTasks      = tasks[activeListId!] ?? []
//   const activeTasks   = allTasks.filter(t => !t.archived)
//   const archivedTasks = allTasks.filter(t => t.archived)

//   const baseList = filter === 'archived' ? archivedTasks
//     : filter === 'all' ? activeTasks
//     : activeTasks.filter(t => t.status === filter)

//   const searched = searchQuery.trim()
//     ? baseList.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()))
//     : baseList

//   const sorted = useMemo(() => [...searched].sort((a, b) => {
//     if (sortKey === 'due_at') {
//       const da = a.due_at ?? a.due_date ?? ''; const db_ = b.due_at ?? b.due_date ?? ''
//       if (!da) return 1; if (!db_) return -1; return da.localeCompare(db_)
//     }
//     if (sortKey === 'priority')   return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
//     if (sortKey === 'created_at') return b.created_at.localeCompare(a.created_at)
//     return a.position - b.position
//   }), [searched, sortKey])

//   // ── Swapy: compute slottedItems from sorted + slotItemMap ──
//   // This is what we render — Swapy re-orders tasks visually
//   // without touching React's key reconciliation.
//   const slottedItems = useMemo(
//     () => utils.toSlottedItems(
//       sorted, 
//       'id', 
//       slotItemMap.filter((x): x is { slot: string; item: string } => x.item !== null)
//     ) as Array<{
//       slotId: string
//       itemId: string
//       item:   Task
//     }>,
//     [sorted, slotItemMap]
//   )

//   // ── Stats ───────────────────────────────────────────────────
//   const { doneCount, totalCount } = useMemo(() => ({
//     doneCount:  activeTasks.filter(t => t.status === 'done').length,
//     totalCount: activeTasks.length,
//   }), [activeTasks])

//   const progress = totalCount ? Math.round((doneCount / totalCount) * 100) : 0
//   const isViewer = myRole === 'viewer'
//   const { run, isPending } = usePending()
//   const isDndBlocked = isPending || reorderStatus === 'saving'

//   // ────────────────────────────────────────────────────────────
//   //  Swapy: Keep in sync when sorted list changes
//   //  (realtime adds/removes, filter switches, etc.)
//   // ────────────────────────────────────────────────────────────


//   // useEffect(() => {
//   //   if (!swapyRef.current) return
//   //   return utils.dynamicSwapy(
//   //     swapyRef.current,
//   //     sorted,
//   //     'id',
//   //     slotItemMap,
//   //     setSlotItemMap
//   //   )
//   // // eslint-disable-next-line react-hooks/exhaustive-deps
//   // }, [sorted])

//   // Swapy: Keep in sync when sorted list changes
// useEffect(() => {
//   if (!swapyRef.current) return

//   const nonNullMap = slotItemMap.filter(
//     (entry): entry is { slot: string; item: string } => entry.item !== null
//   )

//   return utils.dynamicSwapy(
//     swapyRef.current,
//     sorted,
//     'id',
//     nonNullMap,
//     setSlotItemMap
//   )
//   // eslint-disable-next-line react-hooks/exhaustive-deps
// }, [sorted, slotItemMap])



//   // ────────────────────────────────────────────────────────────
//   //  Swapy: Init once on mount, destroy on unmount
//   // ────────────────────────────────────────────────────────────
//   useEffect(() => {
//     if (!containerRef.current) return

//     swapyRef.current = createSwapy(containerRef.current, {
//       manualSwap: true,        // React handles DOM — prevents hydration conflicts
//       animation:  'spring',    // Physics-based spring — most natural on mobile
//       dragOnHold: true,        // 300ms hold required — eliminates scroll conflicts
//       dragAxis:   'y',         // Vertical only — tasks are a linear list
//     })

//     // ── Drag start: light haptic + visual activation ─────────
//     swapyRef.current.onSwapStart(() => {
//       haptic.light()
//     })

//     // ── Swap: update visual order + schedule DB write ────────
//     swapyRef.current.onSwap((event) => {
//       const newMap = event.newSlotItemMap.asArray as SlotItemEntry[]
//       setSlotItemMap(newMap)
//       haptic.select()

//       // Compute new active task order from slot-item map
//       const taskById  = new Map((tasks[activeListId!] ?? []).map((t: Task) => [t.id, t]))
//       const newOrdered: Task[] = newMap
//         .map(({ item }) => (item ? taskById.get(item) : null))
//         .filter((t): t is Task => !!t)

//       // Store original order for rollback (first drag in a series)
//       if (!originalOrderRef.current) {
//         originalOrderRef.current = activeTasks
//       }
//       pendingOrderRef.current = newOrdered

//       // Schedule debounced DB write (2s after last drag)
//       setReorderStatus('pending')
//       clearTimeout(reorderDebounceRef.current)
//       reorderDebounceRef.current = setTimeout(() => {
//         setReorderStatus('saving')
//         void flushReorderSave()
//       }, 2000)
//     })

//     // ── Drag end: medium haptic ──────────────────────────────
//     swapyRef.current.onSwapEnd(() => {
//       haptic.medium()
//     })

//     return () => {
//       swapyRef.current?.destroy()
//       clearTimeout(reorderDebounceRef.current)
//       pendingOrderRef.current  = null
//       originalOrderRef.current = null
//     }
//   // Only re-init when list changes
//   // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [activeListId])

//   // ────────────────────────────────────────────────────────────
//   //  Swapy: Enable/disable based on current UI state
//   //  Drag makes sense ONLY in manual position sort + no filter
//   // ────────────────────────────────────────────────────────────
//   useEffect(() => {
//     const canDrag =
//       !isViewer &&
//       !isDndBlocked &&
//       sortKey === 'position' &&
//       !searchQuery &&
//       filter !== 'archived'

//     swapyRef.current?.enable(canDrag)
//   }, [isViewer, isDndBlocked, sortKey, searchQuery, filter])

//   // ────────────────────────────────────────────────────────────
//   //  Reset on list change
//   // ────────────────────────────────────────────────────────────
//   useEffect(() => {
//     setLoading(true); setFilter('all'); setSortKey('position')
//     setSearchQuery(''); setShowSearch(false); setShowSort(false)
//     setContextMenu(null); wasDone.current = false
//     clearTimeout(reorderDebounceRef.current)
//     pendingOrderRef.current  = null
//     originalOrderRef.current = null
//     setReorderStatus('idle')
//     wantsToGoBackRef.current = false
//     setSlotItemMap([])
//   }, [activeListId])

//   // ────────────────────────────────────────────────────────────
//   //  Role fetch
//   // ────────────────────────────────────────────────────────────
//   useEffect(() => {
//     if (!activeListId || !user) return
//     fetch(`/api/lists/share?listId=${activeListId}&userId=${user.id}`)
//       .then(r => r.json())
//       .then(d => { if (d.myRole) setMyRole(d.myRole) })
//       .catch(() => {})
//   }, [activeListId, user])

//   // ────────────────────────────────────────────────────────────
//   //  Telegram buttons
//   // ────────────────────────────────────────────────────────────
//   useEffect(() => {
//     const tg = window?.Telegram?.WebApp
//     if (!tg) return
//     if (!isViewer) {
//       tg.MainButton.setText(t('newTaskBtn')); tg.MainButton.show()
//       tg.MainButton.onClick(() => { setShowCreate(true); haptic.light() })
//     } else { tg.MainButton.hide() }
//     tg.BackButton.show(); tg.BackButton.onClick(handleBack)
//     return () => {
//       tg.MainButton.hide(); tg.MainButton.offClick(() => {})
//       tg.BackButton.hide(); tg.BackButton.offClick(handleBack)
//     }
//   // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [isViewer])

//   // ────────────────────────────────────────────────────────────
//   //  Page entrance animation
//   // ────────────────────────────────────────────────────────────
//   useEffect(() => {
//     gsap.fromTo(pageRef.current, { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.32, ease: 'power3.out' })
//   }, [])

//   // ────────────────────────────────────────────────────────────
//   //  Online/Offline
//   // ────────────────────────────────────────────────────────────
//   useEffect(() => {
//     const up = () => { setIsOnline(true); fetchTasks(false) }
//     const dn = () => setIsOnline(false)
//     window.addEventListener('online', up); window.addEventListener('offline', dn)
//     return () => { window.removeEventListener('online', up); window.removeEventListener('offline', dn) }
//   // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [])

//   // ────────────────────────────────────────────────────────────
//   //  Realtime subscription
//   // ────────────────────────────────────────────────────────────
//   useEffect(() => {
//     if (!activeListId || !user) return
//     fetchTasks()
//     const debFetch = () => {
//       clearTimeout(fetchDebounceRef.current)
//       fetchDebounceRef.current = setTimeout(() => fetchTasks(false), 300)
//     }
//     const channel = supabase
//       .channel(`tasks-${activeListId}`)
//       .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'tasks', filter: `list_id=eq.${activeListId}` }, debFetch)
//       .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'subtasks' }, debFetch)
//       .subscribe((s: string) => setIsOnline(s === 'SUBSCRIBED'))
//     return () => {
//       supabase.removeChannel(channel)
//       clearTimeout(fetchDebounceRef.current)
//       abortRef.current?.abort()
//     }
//   // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [activeListId, user])

//   // ────────────────────────────────────────────────────────────
//   //  fetchTasks
//   // ────────────────────────────────────────────────────────────
//   async function fetchTasks(showAnim = true) {
//     abortRef.current?.abort(); abortRef.current = new AbortController()
//     try {
//       const [res, resA] = await Promise.all([
//         fetch(`/api/tasks?listId=${activeListId}&userId=${user?.id ?? 0}`, { signal: abortRef.current.signal }),
//         fetch(`/api/tasks?listId=${activeListId}&userId=${user?.id ?? 0}&archived=true`, { signal: abortRef.current.signal }),
//       ])
//       const [data, dataA] = await Promise.all([res.json(), resA.json()])
//       setTasks(activeListId!, [...(data.tasks ?? []), ...(dataA.tasks ?? [])])
//       setLoading(false)
//       if (showAnim) {
//         requestAnimationFrame(() => {
//           const cards = listRef.current?.querySelectorAll('.task-item')
//           if (cards?.length) gsap.fromTo(cards, { x: -14, opacity: 0 }, { x: 0, opacity: 1, duration: 0.26, stagger: 0.04, ease: 'power2.out' })
//         })
//       }
//       const active_ = data.tasks ?? []
//       const allDone = active_.length > 0 && active_.every((t: Task) => t.status === 'done')
//       if (allDone && !wasDone.current) { setShowConfetti(true); haptic.success() }
//       wasDone.current = allDone
//     } catch (e: any) { if (e.name !== 'AbortError') {} }
//   }

//   // ────────────────────────────────────────────────────────────
//   //  Navigation — waits for pending DB write
//   // ────────────────────────────────────────────────────────────
//   function navigateBack() {
//     haptic.light()
//     window?.Telegram?.WebApp?.BackButton?.hide()
//     window?.Telegram?.WebApp?.MainButton?.hide()
//     gsap.to(pageRef.current, { x: 40, opacity: 0, duration: 0.22, ease: 'power2.in', onComplete: onBack })
//   }

//   function handleBack() {
//     if (reorderStatus !== 'idle' || pendingOrderRef.current) {
//       wantsToGoBackRef.current = true
//       if (reorderStatus === 'pending') {
//         clearTimeout(reorderDebounceRef.current)
//         setReorderStatus('saving')
//         void flushReorderSave()
//       }
//       toast.loading(t('saving'), { id: 'reorder-back', duration: 5000 })
//       return
//     }
//     navigateBack()
//   }

//   // ────────────────────────────────────────────────────────────
//   //  flushReorderSave — persist new order to DB
//   // ────────────────────────────────────────────────────────────
//   async function flushReorderSave() {
//     const ordered = pendingOrderRef.current
//     if (!ordered) { setReorderStatus('idle'); return }

//     try {
//       // Optimistically update the store now
//       reorderTasks(activeListId!, [...ordered, ...archivedTasks])

//       const results = await Promise.all(
//         ordered.map((task, i) =>
//           fetch('/api/tasks', {
//             method:  'PATCH',
//             headers: { 'Content-Type': 'application/json' },
//             body:    JSON.stringify({ taskId: task.id, userId: user?.id ?? 0, position: i }),
//           })
//         )
//       )
//       if (results.some(r => !r.ok)) throw new Error('partial failure')

//       pendingOrderRef.current  = null
//       originalOrderRef.current = null
//       toast.dismiss('reorder-back')

//     } catch {
//       toast.dismiss('reorder-back')
//       toast.error(t('reorderFailed'))

//       // Rollback store
//       if (originalOrderRef.current) {
//         reorderTasks(activeListId!, originalOrderRef.current)
//         // Also reset Swapy visual order
//         const origActive = originalOrderRef.current.filter(t => !t.archived)
//         setSlotItemMap(utils.initSlotItemMap(origActive, 'id') as SlotItemEntry[])
//       }
//       pendingOrderRef.current  = null
//       originalOrderRef.current = null

//     } finally {
//       setReorderStatus('idle')
//       if (wantsToGoBackRef.current) {
//         wantsToGoBackRef.current = false
//         navigateBack()
//       }
//     }
//   }

//   // ────────────────────────────────────────────────────────────
//   //  Task actions
//   // ────────────────────────────────────────────────────────────
//   async function handleStatusToggle(task: Task) {
//     if (isViewer || isPending) return
//     const next: TaskStatus = task.status === 'done' ? 'todo' : 'done'
//     updateTask(task.id, { status: next })
//     if (next === 'done') haptic.success(); else haptic.medium()
//     const ok = await run(() =>
//       fetch('/api/tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({ taskId: task.id, userId: user?.id ?? 0, status: next }) })
//         .then(r => { if (!r.ok) throw new Error(); return r })
//     )
//     if (!ok) { updateTask(task.id, { status: task.status }); toast.error(t('failedStatus')) }
//     else {
//       const updated = (tasks[activeListId!] ?? []).map(t => t.id === task.id ? { ...t, status: next } : t)
//       if (updated.filter(t => !t.archived).length > 0 && updated.filter(t => !t.archived).every(t => t.status === 'done')) {
//         setShowConfetti(true); haptic.success()
//       }
//     }
//   }

//   async function handleArchive(task: Task) {
//     if (isPending) return
//     updateTask(task.id, { archived: true }); haptic.medium()
//     const ok = await run(() =>
//       fetch('/api/tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({ taskId: task.id, userId: user?.id ?? 0, archived: true }) })
//         .then(r => { if (!r.ok) throw new Error(); return r })
//     )
//     if (!ok) { updateTask(task.id, { archived: false }); toast.error(t('failedToArchive')) }
//     else toast.success(t('archived'))
//   }

//   async function handleUnarchive(task: Task) {
//     if (isPending) return
//     updateTask(task.id, { archived: false }); haptic.medium()
//     const ok = await run(() =>
//       fetch('/api/tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({ taskId: task.id, userId: user?.id ?? 0, archived: false }) })
//         .then(r => { if (!r.ok) throw new Error(); return r })
//     )
//     if (!ok) { updateTask(task.id, { archived: true }); toast.error(t('failedToRestore')) }
//     else toast.success(t('restored'))
//   }

//   async function handleDelete(task: Task) {
//     if (isPending) return
//     removeTask(task.id, task.list_id); haptic.heavy()
//     const ok = await run(() =>
//       fetch(`/api/tasks?taskId=${task.id}&userId=${user?.id ?? 0}`, { method: 'DELETE' })
//         .then(r => { if (!r.ok) throw new Error(); return r })
//     )
//     if (!ok) { fetchTasks(false); toast.error(t('failedToDelete')) }
//     else toast(t('taskDeleted'), { action: { label: t('cancel'), onClick: () => fetchTasks(false) }, duration: 4000 })
//   }

//   function getContextItems(task: Task): ContextMenuItem[] {
//     if (isViewer) return [{ label: t('viewTask'), icon: '👁', onClick: () => setViewerTask(task) }]
//     return [
//       { label: t('edit'),   icon: '✏️', onClick: () => setActiveTask(task) },
//       task.status !== 'done'
//         ? { label: t('markAsDone'), icon: '✅', onClick: () => handleStatusToggle(task) }
//         : { label: t('markAsTodo'), icon: '⬜', onClick: () => handleStatusToggle(task) },
//       task.archived
//         ? { label: t('restored'), icon: '📤', onClick: () => handleUnarchive(task) }
//         : { label: t('archived'), icon: '📦', onClick: () => handleArchive(task) },
//       { label: t('delete'), icon: '🗑️', color: 'text-danger', onClick: () => handleDelete(task) },
//     ]
//   }

//   // ── Pull-to-refresh ────────────────────────────────────────
//   function onTouchStart(e: React.TouchEvent) { pullStartY.current = e.touches[0].clientY }
//   function onTouchMove(e: React.TouchEvent) {
//     if (!listRef.current || listRef.current.scrollTop > 0) return
//     if (e.touches[0].clientY - pullStartY.current < 40) return
//     setIsPulling(true)
//   }
//   async function onTouchEnd() {
//     if (!isPulling) return; setIsPulling(false); haptic.light()
//     await fetchTasks(); toast.success(t('refreshed'))
//   }

//   if (!list) return null

//   // ── Reorder status badge ────────────────────────────────────
//   const reorderBadge = reorderStatus === 'pending'
//     ? { show: true, icon: <ArrowUpDown size={10} />, label: '2s…', cls: 'bg-accent/10 text-accent border-accent/20' }
//     : reorderStatus === 'saving'
//     ? { show: true, icon: <div className="w-2.5 h-2.5 border border-current/30 border-t-current rounded-full animate-spin" />, label: t('saving'), cls: 'bg-amber/10 text-amber border-amber/20' }
//     : { show: false, icon: null, label: '', cls: '' }

//   // Drag is only visually meaningful in manual sort mode without filters
//   const isDragMode = sortKey === 'position' && !searchQuery && filter !== 'archived' && !isViewer

//   // ────────────────────────────────────────────────────────────
//   //  Render
//   // ────────────────────────────────────────────────────────────
//   return (
//     <div ref={pageRef} className="page-container">
//       {showConfetti && <Confetti onDone={() => setShowConfetti(false)} />}

//       {/* ── Header ──────────────────────────────────────────── */}
//       <div className="px-4 pt-3 pb-2 flex-shrink-0">
//         <div className="flex items-center gap-2 mb-2">
//           <button onClick={handleBack} className="btn-ghost p-2 -ml-2"><ArrowLeft size={20} /></button>
//           <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xl flex-shrink-0" style={{ background: `${list.color}20` }}>
//             {list.emoji}
//           </div>
//           <div className="flex-1 min-w-0">
//             <div className="flex items-center gap-1.5 flex-wrap">
//               <h1 className="font-bold text-base truncate">{list.title}</h1>
//               <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors', isOnline ? 'bg-emerald' : 'bg-danger animate-pulse')} />
//               {isViewer && (
//                 <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-text-dim/20 text-text-secondary flex-shrink-0">
//                   <Eye size={9} /> {t('viewOnly')}
//                 </span>
//               )}
//               {reorderBadge.show && (
//                 <span className={cn('flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border flex-shrink-0 transition-all duration-200', reorderBadge.cls)}>
//                   {reorderBadge.icon}{reorderBadge.label}
//                 </span>
//               )}
//             </div>
//             {totalCount > 0 && <p className="text-xs text-text-secondary">{doneCount}/{totalCount} {t('subtasksDone')}</p>}
//           </div>
//           <button onClick={toggleTheme} className="btn-ghost p-2">
//             {theme === 'dark' ? <Sun size={17} className="text-amber" /> : <Moon size={17} />}
//           </button>
//           <button onClick={() => { setShowSearch(!showSearch); if (!showSearch) setTimeout(() => searchRef.current?.focus(), 100) }}
//             className={cn('btn-ghost p-2', showSearch && 'text-accent bg-accent/10')}>
//             <Search size={17} />
//           </button>
//           <button onClick={() => setShowSort(!showSort)}
//             className={cn('btn-ghost p-2', sortKey !== 'position' && 'text-accent bg-accent/10')}>
//             <SortAsc size={17} />
//           </button>
//         </div>

//         {showSearch && (
//           <div className="relative mb-2 animate-fade-up">
//             <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
//             <input ref={searchRef} value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
//               placeholder={t('searchPlaceholder')} className="input-field pl-9 pr-9 py-2.5 text-sm" />
//             {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim"><X size={15} /></button>}
//           </div>
//         )}

//         {showSort && (
//           <div className="flex gap-1.5 mb-2 overflow-x-auto animate-fade-up">
//             {([
//               { key: 'position',   label: t('sortManual')   },
//               { key: 'due_at',     label: t('sortDueDate')  },
//               { key: 'priority',   label: t('sortPriority') },
//               { key: 'created_at', label: t('sortNewest')   },
//             ] as { key: SortKey; label: string }[]).map(s => (
//               <button key={s.key} onClick={() => { setSortKey(s.key); haptic.select() }}
//                 className={cn('px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap', sortKey === s.key ? 'bg-accent text-white' : 'bg-bg-card text-text-secondary')}>
//                 {s.label}
//               </button>
//             ))}
//           </div>
//         )}

//         {totalCount > 0 && filter !== 'archived' && (
//           <div className="h-1 bg-bg-card rounded-full overflow-hidden mb-2.5">
//             <div className="h-full rounded-full transition-all duration-700"
//               style={{ width: `${progress}%`, background: progress === 100 ? 'linear-gradient(90deg,#3ECF8E,#22B97A)' : `linear-gradient(90deg,${list.color},${list.color}cc)` }} />
//           </div>
//         )}

//         <div className="flex gap-1 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
//           {STATUS_TABS.map(tab => {
//             const count = tab.key === 'all' ? activeTasks.length : tab.key === 'archived' ? archivedTasks.length : activeTasks.filter(t => t.status === tab.key).length
//             return (
//               <button key={tab.key} onClick={() => { setFilter(tab.key); haptic.select() }}
//                 className={cn('px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all',
//                   filter === tab.key ? 'bg-accent text-white shadow-glow-sm' : 'text-text-secondary hover:bg-bg-hover')}>
//                 {tab.label}
//                 {count > 0 && <span className={cn('ml-1.5 text-xs', filter === tab.key ? 'opacity-80' : 'opacity-50')}>{count}</span>}
//               </button>
//             )
//           })}
//         </div>

//         {!isOnline && (
//           <div className="flex items-center justify-between gap-2 bg-danger/10 border border-danger/20 rounded-xl px-3 py-2 mt-2 animate-fade-up">
//             <div className="flex items-center gap-2 text-xs text-danger font-medium">
//               <span className="w-1.5 h-1.5 rounded-full bg-danger animate-pulse flex-shrink-0" />{t('noConnection')}
//             </div>
//             <button onClick={() => fetchTasks()} className="text-xs text-danger underline">{t('retry')}</button>
//           </div>
//         )}
//         {isPulling && (
//           <div className="flex items-center justify-center py-2 text-xs text-accent gap-1.5 animate-fade-up">
//             <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
//             {t('releaseToRefresh')}
//           </div>
//         )}
//       </div>

//       {/* ── Task list ────────────────────────────────────────── */}
//       <div className="flex-1 relative min-h-0">
//         {isPending && <div className="absolute inset-0 z-20 bg-bg-base/30 backdrop-blur-[1px] pointer-events-auto" />}

//         <div
//           ref={listRef}
//           className="h-full scrollable px-4 pb-24"
//           onTouchStart={onTouchStart}
//           onTouchMove={onTouchMove}
//           onTouchEnd={onTouchEnd}
//         >
//           {loading ? (
//             <div className="space-y-2 mt-2">
//               {[...Array(4)].map((_, i) => (
//                 <div key={i} className="h-16 skeleton rounded-2xl" style={{ animationDelay: `${i * 80}ms` }} />
//               ))}
//             </div>
//           ) : sorted.length === 0 ? (
//             <div className="flex flex-col items-center justify-center h-48 text-center animate-fade-up">
//               <p className="text-text-dim text-sm">
//                 {searchQuery ? t('noTasksMatch') : filter === 'archived' ? t('nothingArchived') : t('noTasksHere')}
//               </p>
//               {!searchQuery && filter !== 'archived' && !isViewer && (
//                 <button onClick={() => setShowCreate(true)} className="mt-3 text-accent text-sm font-medium">{t('addOne')}</button>
//               )}
//             </div>
//           ) : (
//             // ── Swapy container ────────────────────────────────
//             // Each slot wraps one item. Swapy re-orders slots on swap.
//             // data-swapy-slot and data-swapy-item are the only API surface.
//             <div ref={containerRef} className="space-y-2 mt-2">
//               {slottedItems.map(({ slotId, itemId, item: task }) => (
//                 // Slot: the position holder — keeps its place in the DOM
//                 <div
//                   key={slotId}
//                   data-swapy-slot={slotId}
//                   className="swapy-slot"
//                 >
//                   {/* Item: the draggable card — moves between slots */}
//                   <div
//                     key={itemId}
//                     data-swapy-item={itemId}
//                     className="task-item"
//                   >
//                     <TaskCard
//                       task={task}
//                       isViewer={isViewer}
//                       isDragMode={isDragMode}
//                       onToggle={() => handleStatusToggle(task)}
//                       onOpen={() => isViewer ? setViewerTask(task) : setActiveTask(task)}
//                       onLongPress={(x, y) => { setContextMenu({ task, x, y }); haptic.medium() }}
//                     />
//                   </div>
//                 </div>
//               ))}
//             </div>
//           )}
//         </div>
//       </div>

//       {/* ── FAB ─────────────────────────────────────────────── */}
//       {!isViewer && !(typeof window !== 'undefined' && window?.Telegram?.WebApp?.MainButton?.isVisible) && (
//         <button
//           onClick={() => { if (isPending) return; setShowCreate(true); haptic.light() }}
//           disabled={isPending}
//           className={cn(
//             'fixed bottom-6 right-4 w-14 h-14 rounded-2xl bg-accent text-white',
//             'flex items-center justify-center shadow-glow z-40',
//             'active:scale-90 transition-all duration-150',
//             isPending && 'opacity-40 cursor-not-allowed'
//           )}
//         >
//           {isPending
//             ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
//             : <Plus size={24} strokeWidth={2.5} />
//           }
//         </button>
//       )}

//       {contextMenu && (
//         <ContextMenu items={getContextItems(contextMenu.task)} x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} />
//       )}
//       {viewerTask && (
//         <ViewerTaskSheet task={viewerTask} userId={user?.id ?? 0} onClose={() => setViewerTask(null)} onSubtaskToggled={() => fetchTasks(false)} />
//       )}
//       {(showCreate || activeTask) && (
//         <TaskSheet
//           listId={activeListId!}
//           userId={user?.id ?? 0}
//           task={activeTask ?? undefined}
//           onClose={() => { setShowCreate(false); setActiveTask(null) }}
//           onSaved={() => { setShowCreate(false); setActiveTask(null); fetchTasks() }}
//         />
//       )}
//     </div>
//   )
// }

// // ─────────────────────────────────────────────────────────────
// //  TaskCard — simplified: no useSortable, no CSS transforms.
// //  Swapy handles all drag mechanics via data attributes.
// // ─────────────────────────────────────────────────────────────
// interface CardProps {
//   task:        Task
//   isViewer:    boolean
//   isDragMode:  boolean   // show grip only when drag is meaningful
//   onToggle:    () => void
//   onOpen:      () => void
//   onLongPress: (x: number, y: number) => void
// }

// function TaskCard({ task, isViewer, isDragMode, onToggle, onOpen, onLongPress }: CardProps) {
//   const { t } = useI18n()

//   // Local state for hold-pulse effect on the grip handle
//   const [isHolding, setIsHolding] = useState(false)
//   const holdTimer = useRef<ReturnType<typeof setTimeout>>()

//   const longPressTimer = useRef<ReturnType<typeof setTimeout>>()
//   const didLongPress   = useRef(false)

//   const priority   = PRIORITY_CONFIG[task.priority]
//   const isDone     = task.status === 'done'
//   const isArchived = task.archived
//   const subDone    = task.subtasks?.filter(s => s.completed).length ?? 0
//   const subTotal   = task.subtasks?.length ?? 0
//   const dueAt      = task.due_at ?? task.due_date
//   const creatorTz  = task.creator_tz ?? 'UTC'
//   const viewerTz   = Intl.DateTimeFormat().resolvedOptions().timeZone

//   let dueLabel = '', dueUrgent = false, dueOverdue = false, dueLocalLabel = ''
//   if (dueAt) {
//     const d = new Date(dueAt), now = new Date()
//     const diff = Math.round((d.getTime() - now.getTime()) / 86400000)
//     dueOverdue = diff < 0; dueUrgent = diff <= 1
//     dueLabel = dueOverdue
//       ? `${Math.abs(diff)}${t('dOverdue')}`
//       : diff === 0 ? t('today')
//       : diff === 1 ? t('tomorrow')
//       : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: creatorTz })
//     if (creatorTz !== viewerTz)
//       dueLocalLabel = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: viewerTz })
//   }

//   function handleTouchStart(e: React.TouchEvent) {
//     didLongPress.current = false
//     const { clientX, clientY } = e.touches[0]
//     longPressTimer.current = setTimeout(() => { didLongPress.current = true; onLongPress(clientX, clientY) }, 500)
//   }
//   function handleTouchEnd() { clearTimeout(longPressTimer.current) }
//   function handleClick()    { if (!didLongPress.current) onOpen() }

//   // Grip hold visual feedback
//   function handleGripDown() {
//     holdTimer.current = setTimeout(() => setIsHolding(true), 50)
//   }
//   function handleGripUp() {
//     clearTimeout(holdTimer.current)
//     setIsHolding(false)
//   }

//   return (
//     <div className="card-shell">
//       <div className={cn(
//         'card flex items-start overflow-hidden',
//         isDone     && 'opacity-55',
//         isArchived && 'opacity-40',
//       )}>
//         {/* Priority stripe */}
//         <div className="w-1 self-stretch flex-shrink-0 rounded-l-2xl"
//           style={{ background: priority.dot, opacity: isDone ? 0.4 : 1 }} />

//         <div className="flex items-start gap-2.5 p-3.5 flex-1 min-w-0">

//           {/* ── Drag handle / viewer indicator ──────────────── */}
//           {isDragMode ? (
//             // data-swapy-handle makes ONLY this element the drag trigger.
//             // dragOnHold: true means user must hold 300ms before drag activates.
//             // The pulse ring gives visual feedback during that hold period.
//             <div
//               data-swapy-handle
//               onPointerDown={handleGripDown}
//               onPointerUp={handleGripUp}
//               onPointerLeave={handleGripUp}
//               className={cn(
//                 'mt-0.5 flex-shrink-0 touch-none select-none cursor-grab active:cursor-grabbing',
//                 'relative transition-colors duration-150',
//                 isHolding ? 'text-accent' : 'text-text-dim hover:text-text-secondary'
//               )}
//             >
//               <GripVertical size={15} />
//               {/* Hold-pulse ring — appears while user presses before drag starts */}
//               {isHolding && (
//                 <span className="absolute inset-[-5px] rounded-full border border-accent/50 animate-ping pointer-events-none" />
//               )}
//             </div>
//           ) : (
//             <Eye size={13} className="text-text-dim mt-1 flex-shrink-0 opacity-40" />
//           )}

//           {/* ── Completion checkbox ──────────────────────────── */}
//           <button
//             onClick={isViewer ? undefined : onToggle}
//             // data-swapy-no-drag prevents accidental drag when tapping checkbox
//             data-swapy-no-drag
//             className={cn('custom-checkbox mt-0.5', isDone ? 'checked' : 'unchecked', isViewer && 'opacity-60 cursor-default')}
//           >
//             {isDone && (
//               <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
//                 <path d="M1 4L4 7L10 1" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
//               </svg>
//             )}
//           </button>

//           {/* ── Task body ────────────────────────────────────── */}
//           <button
//             data-swapy-no-drag
//             onTouchStart={handleTouchStart}
//             onTouchEnd={handleTouchEnd}
//             onClick={handleClick}
//             className="flex-1 min-w-0 text-left"
//           >
//             <p className={cn('text-sm font-medium leading-snug', isDone && 'line-through text-text-secondary')}>
//               {task.title}
//             </p>
//             {task.description && !isDone && (
//               <p className="text-xs text-text-dim mt-0.5 truncate">
//                 <MentionText text={task.description} />
//               </p>
//             )}
//             <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
//               <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', priority.color, priority.bg)}>
//                 {priority.label}
//               </span>
//               {task.assigned_user && (
//                 <span className="text-xs text-text-secondary flex items-center gap-1">
//                   <div className="w-4 h-4 rounded-full bg-accent/20 text-accent flex items-center justify-center text-[9px] font-bold flex-shrink-0">
//                     {task.assigned_user.first_name[0]?.toUpperCase()}
//                   </div>
//                   {task.assigned_user.first_name.split(' ')[0]}
//                 </span>
//               )}
//               {dueAt && (
//                 <span className={cn('text-xs flex items-center gap-1',
//                   dueOverdue ? 'text-danger' : dueUrgent ? 'text-amber' : 'text-text-secondary')}>
//                   <Calendar size={11} />{dueLabel}
//                   {dueLocalLabel && <span className="text-accent ml-0.5">· {dueLocalLabel}</span>}
//                 </span>
//               )}
//               {subTotal > 0 && (
//                 <span className="text-xs text-text-secondary flex items-center gap-1">
//                   <CheckCircle2 size={11} />{subDone}/{subTotal}
//                 </span>
//               )}
//               {isArchived && <span className="text-xs text-text-dim">📦 {t('archived')}</span>}
//             </div>
//           </button>

//         </div>
//       </div>
//     </div>
//   )
// }

// // ─────────────────────────────────────────────────────────────
// //  MentionText — highlight @username in descriptions
// // ─────────────────────────────────────────────────────────────
// function MentionText({ text }: { text: string }) {
//   return (
//     <>
//       {text.split(/(@[a-zA-Z0-9_]+)/g).map((p, i) =>
//         /^@[a-zA-Z0-9_]+$/.test(p)
//           ? <span key={i} className="text-accent font-medium">{p}</span>
//           : <span key={i}>{p}</span>
//       )}
//     </>
//   )
// }















































































'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { gsap } from 'gsap'
import { createSwapy, utils } from 'swapy'
import { supabase } from '@/lib/supabase'
import { useTaskStore } from '@/lib/store'
import { useTelegram } from '@/hooks/useTelegram'
import { PRIORITY_CONFIG, cn } from '@/lib/utils'
import {
  ArrowLeft, Plus, GripVertical, Search, X, SortAsc,
  Calendar, CheckCircle2, Eye, Sun, Moon, ArrowUpDown,
} from 'lucide-react'
import { TaskSheet }       from '@/components/TaskSheet'
import { ViewerTaskSheet } from '@/components/ViewerTaskSheet'
import { ContextMenu, type ContextMenuItem } from '@/components/ContextMenu'
import { Confetti }        from '@/components/Confetti'
import type { Task, TaskStatus, Priority, MemberRole } from '@/types'
import { toast } from 'sonner'
import { usePending }  from '@/hooks/usePending'
import { useTheme }    from '@/lib/theme-context'
import { useI18n }     from '@/lib/i18n-context'

// ─────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────
interface Props { onBack: () => void }

type SortKey       = 'position' | 'due_at' | 'priority' | 'created_at'
type FilterKey     = TaskStatus | 'all' | 'archived'
type ReorderStatus = 'idle' | 'pending' | 'saving'

const PRIORITY_ORDER: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

// ─────────────────────────────────────────────────────────────
//  ListDetailView
// ─────────────────────────────────────────────────────────────
export function ListDetailView({ onBack }: Props) {
  const { theme, toggleTheme } = useTheme()
  const { t } = useI18n()

  const STATUS_TABS: { key: FilterKey; label: string }[] = [
    { key: 'all',         label: t('filter_all')     },
    { key: 'todo',        label: t('filter_todo')    },
    { key: 'in_progress', label: t('filter_doing')   },
    { key: 'done',        label: t('filter_done')    },
    { key: 'archived',    label: t('filter_archive') },
  ]

  const { user, haptic } = useTelegram()
  const { lists, tasks, activeListId, setTasks, updateTask, removeTask, reorderTasks } = useTaskStore()
  const list = lists.find(l => l.id === activeListId)

  // ── UI state ────────────────────────────────────────────────
  const [myRole,       setMyRole]       = useState<MemberRole>('viewer')
  const [filter,       setFilter]       = useState<FilterKey>('all')
  const [sortKey,      setSortKey]      = useState<SortKey>('position')
  const [loading,      setLoading]      = useState(true)
  const [searchQuery,  setSearchQuery]  = useState('')
  const [showSearch,   setShowSearch]   = useState(false)
  const [showSort,     setShowSort]     = useState(false)
  const [activeTask,   setActiveTask]   = useState<Task | null>(null)
  const [showCreate,   setShowCreate]   = useState(false)
  const [isOnline,     setIsOnline]     = useState(true)
  const [showConfetti, setShowConfetti] = useState(false)
  const [contextMenu,  setContextMenu]  = useState<{ task: Task; x: number; y: number } | null>(null)
  const [isPulling,    setIsPulling]    = useState(false)
  const [viewerTask,   setViewerTask]   = useState<Task | null>(null)

  // ── Reorder debounce state ──────────────────────────────────
  const [reorderStatus,    setReorderStatus]    = useState<ReorderStatus>('idle')
  const reorderDebounceRef = useRef<ReturnType<typeof setTimeout>>()
  const pendingOrderRef    = useRef<Task[] | null>(null)
  const originalOrderRef   = useRef<Task[] | null>(null)
  const wantsToGoBackRef   = useRef(false)

  // ── Swapy refs ──────────────────────────────────────────────
  const swapyRef     = useRef<ReturnType<typeof createSwapy> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // ── Swapy slot-item mapping (drives render order) ───────────
  const [slotItemMap, setSlotItemMap] = useState<{ slot: string; item: string | null }[]>([])

  // ── Other refs ──────────────────────────────────────────────
  const pageRef    = useRef<HTMLDivElement>(null)
  const listRef    = useRef<HTMLDivElement>(null)
  const searchRef  = useRef<HTMLInputElement>(null)
  const pullStartY       = useRef(0)
  const wasDone          = useRef(false)
  const fetchDebounceRef = useRef<ReturnType<typeof setTimeout>>()
  const abortRef         = useRef<AbortController>()

  // ── Derived task lists ──────────────────────────────────────
  const allTasks      = tasks[activeListId!] ?? []
  const activeTasks   = allTasks.filter(t => !t.archived)
  const archivedTasks = allTasks.filter(t => t.archived)

  const baseList = filter === 'archived' ? archivedTasks
    : filter === 'all' ? activeTasks
    : activeTasks.filter(t => t.status === filter)

  const searched = searchQuery.trim()
    ? baseList.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : baseList

  const sorted = useMemo(() => [...searched].sort((a, b) => {
    if (sortKey === 'due_at') {
      const da = a.due_at ?? a.due_date ?? ''; const db_ = b.due_at ?? b.due_date ?? ''
      if (!da) return 1; if (!db_) return -1; return da.localeCompare(db_)
    }
    if (sortKey === 'priority')   return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    if (sortKey === 'created_at') return b.created_at.localeCompare(a.created_at)
    return a.position - b.position
  }), [searched, sortKey])

  // slottedItems — что рендерится; порядок определяется slotItemMap после свапа.
  // Пока slotItemMap пуст (первый рендер до dynamicSwapy) — рендерим sorted напрямую.
  const slottedItems = useMemo(() => {
    if (slotItemMap.length === 0) {
      return sorted.map(item => ({ slotId: String(item.id), itemId: String(item.id), item }))
    }
    return utils.toSlottedItems(sorted, 'id', slotItemMap.filter((x): x is { slot: string; item: string } => x.item !== null)) as Array<{
      slotId: string
      itemId: string
      item:   Task
    }>
  }, [sorted, slotItemMap])

  // ── Stats ───────────────────────────────────────────────────
  const { doneCount, totalCount } = useMemo(() => ({
    doneCount:  activeTasks.filter(t => t.status === 'done').length,
    totalCount: activeTasks.length,
  }), [activeTasks])

  const progress = totalCount ? Math.round((doneCount / totalCount) * 100) : 0
  const isViewer = myRole === 'viewer'
  const { run, isPending } = usePending()
  const isDndBlocked = isPending || reorderStatus === 'saving'

  // ────────────────────────────────────────────────────────────
  //  Swapy: Init once on mount, destroy on unmount
  // ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return

    swapyRef.current = createSwapy(containerRef.current, {
      manualSwap: true,
      animation:  'spring',
      dragOnHold: true,
      dragAxis:   'y',
    })

    // ── Drag start ───────────────────────────────────────────
    swapyRef.current.onSwapStart(() => {
      haptic.light()
    })

    // ── Swap: при manualSwap React сам обновляет DOM через state ─
    swapyRef.current.onSwap((event) => {
      const newMap = event.newSlotItemMap.asArray
      setSlotItemMap(newMap)
      haptic.select()

      const taskById  = new Map((tasks[activeListId!] ?? []).map((t: Task) => [t.id, t]))
      const newOrdered: Task[] = newMap
        .map(({ item }) => (item ? taskById.get(item) : null))
        .filter((t): t is Task => !!t && !t.archived)

      if (!originalOrderRef.current) {
        originalOrderRef.current = activeTasks
      }
      pendingOrderRef.current = newOrdered

      setReorderStatus('pending')
      clearTimeout(reorderDebounceRef.current)
      reorderDebounceRef.current = setTimeout(() => {
        setReorderStatus('saving')
        void flushReorderSave()
      }, 2000)
    })

    // ── Drag end ─────────────────────────────────────────────
    swapyRef.current.onSwapEnd(() => {
      haptic.medium()
    })

    return () => {
      swapyRef.current?.destroy()
      clearTimeout(reorderDebounceRef.current)
      pendingOrderRef.current  = null
      originalOrderRef.current = null
    }
  // Only re-init when list changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeListId])

  // ────────────────────────────────────────────────────────────
  //  Swapy: синхронизируем при внешних изменениях (realtime, фильтр)
  // ────────────────────────────────────────────────────────────
  useEffect(
    () => utils.dynamicSwapy(
      swapyRef.current,
      sorted,
      'id',
      slotItemMap.filter((x): x is { slot: string; item: string } => x.item !== null),
      setSlotItemMap
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sorted]
  )

  // ────────────────────────────────────────────────────────────
  //  Swapy: Enable/disable based on current UI state
  // ────────────────────────────────────────────────────────────
  useEffect(() => {
    const canDrag =
      !isViewer &&
      !isDndBlocked &&
      sortKey === 'position' &&
      !searchQuery &&
      filter !== 'archived'

    swapyRef.current?.enable(canDrag)
  }, [isViewer, isDndBlocked, sortKey, searchQuery, filter])

  // ────────────────────────────────────────────────────────────
  //  Reset on list change
  // ────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true); setFilter('all'); setSortKey('position')
    setSearchQuery(''); setShowSearch(false); setShowSort(false)
    setContextMenu(null); wasDone.current = false
    clearTimeout(reorderDebounceRef.current)
    pendingOrderRef.current  = null
    originalOrderRef.current = null
    setReorderStatus('idle')
    wantsToGoBackRef.current = false
    setSlotItemMap([])
  }, [activeListId])

  // ────────────────────────────────────────────────────────────
  //  Role fetch
  // ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeListId || !user) return
    fetch(`/api/lists/share?listId=${activeListId}&userId=${user.id}`)
      .then(r => r.json())
      .then(d => { if (d.myRole) setMyRole(d.myRole) })
      .catch(() => {})
  }, [activeListId, user])

  // ────────────────────────────────────────────────────────────
  //  Telegram buttons
  // ────────────────────────────────────────────────────────────
  useEffect(() => {
    const tg = window?.Telegram?.WebApp
    if (!tg) return
    if (!isViewer) {
      tg.MainButton.setText(t('newTaskBtn')); tg.MainButton.show()
      tg.MainButton.onClick(() => { setShowCreate(true); haptic.light() })
    } else { tg.MainButton.hide() }
    tg.BackButton.show(); tg.BackButton.onClick(handleBack)
    return () => {
      tg.MainButton.hide(); tg.MainButton.offClick(() => {})
      tg.BackButton.hide(); tg.BackButton.offClick(handleBack)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isViewer])

  // ────────────────────────────────────────────────────────────
  //  Page entrance animation
  // ────────────────────────────────────────────────────────────
  useEffect(() => {
    gsap.fromTo(pageRef.current, { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.32, ease: 'power3.out' })
  }, [])

  // ────────────────────────────────────────────────────────────
  //  Online/Offline
  // ────────────────────────────────────────────────────────────
  useEffect(() => {
    const up = () => { setIsOnline(true); fetchTasks(false) }
    const dn = () => setIsOnline(false)
    window.addEventListener('online', up); window.addEventListener('offline', dn)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', dn) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ────────────────────────────────────────────────────────────
  //  Realtime subscription
  // ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeListId || !user) return
    fetchTasks()
    const debFetch = () => {
      clearTimeout(fetchDebounceRef.current)
      fetchDebounceRef.current = setTimeout(() => fetchTasks(false), 300)
    }
    const channel = supabase
      .channel(`tasks-${activeListId}`)
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'tasks', filter: `list_id=eq.${activeListId}` }, debFetch)
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'subtasks' }, debFetch)
      .subscribe((s: string) => setIsOnline(s === 'SUBSCRIBED'))
    return () => {
      supabase.removeChannel(channel)
      clearTimeout(fetchDebounceRef.current)
      abortRef.current?.abort()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeListId, user])

  // ────────────────────────────────────────────────────────────
  //  fetchTasks
  // ────────────────────────────────────────────────────────────
  async function fetchTasks(showAnim = true) {
    abortRef.current?.abort(); abortRef.current = new AbortController()
    try {
      const [res, resA] = await Promise.all([
        fetch(`/api/tasks?listId=${activeListId}&userId=${user?.id ?? 0}`, { signal: abortRef.current.signal }),
        fetch(`/api/tasks?listId=${activeListId}&userId=${user?.id ?? 0}&archived=true`, { signal: abortRef.current.signal }),
      ])
      const [data, dataA] = await Promise.all([res.json(), resA.json()])
      setTasks(activeListId!, [...(data.tasks ?? []), ...(dataA.tasks ?? [])])
      setLoading(false)
      if (showAnim) {
        requestAnimationFrame(() => {
          const cards = listRef.current?.querySelectorAll('.task-item')
          if (cards?.length) gsap.fromTo(cards, { x: -14, opacity: 0 }, { x: 0, opacity: 1, duration: 0.26, stagger: 0.04, ease: 'power2.out' })
        })
      }
      const active_ = data.tasks ?? []
      const allDone = active_.length > 0 && active_.every((t: Task) => t.status === 'done')
      if (allDone && !wasDone.current) { setShowConfetti(true); haptic.success() }
      wasDone.current = allDone
    } catch (e: any) { if (e.name !== 'AbortError') {} }
  }

  // ────────────────────────────────────────────────────────────
  //  Navigation
  // ────────────────────────────────────────────────────────────
  function navigateBack() {
    haptic.light()
    window?.Telegram?.WebApp?.BackButton?.hide()
    window?.Telegram?.WebApp?.MainButton?.hide()
    gsap.to(pageRef.current, { x: 40, opacity: 0, duration: 0.22, ease: 'power2.in', onComplete: onBack })
  }

  function handleBack() {
    if (reorderStatus !== 'idle' || pendingOrderRef.current) {
      wantsToGoBackRef.current = true
      if (reorderStatus === 'pending') {
        clearTimeout(reorderDebounceRef.current)
        setReorderStatus('saving')
        void flushReorderSave()
      }
      toast.loading(t('saving'), { id: 'reorder-back', duration: 5000 })
      return
    }
    navigateBack()
  }

  // ────────────────────────────────────────────────────────────
  //  flushReorderSave
  // ────────────────────────────────────────────────────────────
  async function flushReorderSave() {
    const ordered = pendingOrderRef.current
    if (!ordered) { setReorderStatus('idle'); return }

    try {
      reorderTasks(activeListId!, [...ordered, ...archivedTasks])

      const results = await Promise.all(
        ordered.map((task, i) =>
          fetch('/api/tasks', {
            method:  'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ taskId: task.id, userId: user?.id ?? 0, position: i }),
          })
        )
      )
      if (results.some(r => !r.ok)) throw new Error('partial failure')

      pendingOrderRef.current  = null
      originalOrderRef.current = null
      toast.dismiss('reorder-back')

    } catch {
      toast.dismiss('reorder-back')
      toast.error(t('reorderFailed'))

      if (originalOrderRef.current) {
        reorderTasks(activeListId!, originalOrderRef.current)
      }
      pendingOrderRef.current  = null
      originalOrderRef.current = null

    } finally {
      setReorderStatus('idle')
      if (wantsToGoBackRef.current) {
        wantsToGoBackRef.current = false
        navigateBack()
      }
    }
  }

  // ────────────────────────────────────────────────────────────
  //  Task actions
  // ────────────────────────────────────────────────────────────
  async function handleStatusToggle(task: Task) {
    if (isViewer || isPending) return
    const next: TaskStatus = task.status === 'done' ? 'todo' : 'done'
    updateTask(task.id, { status: next })
    if (next === 'done') haptic.success(); else haptic.medium()
    const ok = await run(() =>
      fetch('/api/tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id, userId: user?.id ?? 0, status: next }) })
        .then(r => { if (!r.ok) throw new Error(); return r })
    )
    if (!ok) { updateTask(task.id, { status: task.status }); toast.error(t('failedStatus')) }
    else {
      const updated = (tasks[activeListId!] ?? []).map(t => t.id === task.id ? { ...t, status: next } : t)
      if (updated.filter(t => !t.archived).length > 0 && updated.filter(t => !t.archived).every(t => t.status === 'done')) {
        setShowConfetti(true); haptic.success()
      }
    }
  }

  async function handleArchive(task: Task) {
    if (isPending) return
    updateTask(task.id, { archived: true }); haptic.medium()
    const ok = await run(() =>
      fetch('/api/tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id, userId: user?.id ?? 0, archived: true }) })
        .then(r => { if (!r.ok) throw new Error(); return r })
    )
    if (!ok) { updateTask(task.id, { archived: false }); toast.error(t('failedToArchive')) }
    else toast.success(t('archived'))
  }

  async function handleUnarchive(task: Task) {
    if (isPending) return
    updateTask(task.id, { archived: false }); haptic.medium()
    const ok = await run(() =>
      fetch('/api/tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id, userId: user?.id ?? 0, archived: false }) })
        .then(r => { if (!r.ok) throw new Error(); return r })
    )
    if (!ok) { updateTask(task.id, { archived: true }); toast.error(t('failedToRestore')) }
    else toast.success(t('restored'))
  }

  async function handleDelete(task: Task) {
    if (isPending) return
    removeTask(task.id, task.list_id); haptic.heavy()
    const ok = await run(() =>
      fetch(`/api/tasks?taskId=${task.id}&userId=${user?.id ?? 0}`, { method: 'DELETE' })
        .then(r => { if (!r.ok) throw new Error(); return r })
    )
    if (!ok) { fetchTasks(false); toast.error(t('failedToDelete')) }
    else toast(t('taskDeleted'), { action: { label: t('cancel'), onClick: () => fetchTasks(false) }, duration: 4000 })
  }

  function getContextItems(task: Task): ContextMenuItem[] {
    if (isViewer) return [{ label: t('viewTask'), icon: '👁', onClick: () => setViewerTask(task) }]
    return [
      { label: t('edit'),   icon: '✏️', onClick: () => setActiveTask(task) },
      task.status !== 'done'
        ? { label: t('markAsDone'), icon: '✅', onClick: () => handleStatusToggle(task) }
        : { label: t('markAsTodo'), icon: '⬜', onClick: () => handleStatusToggle(task) },
      task.archived
        ? { label: t('restored'), icon: '📤', onClick: () => handleUnarchive(task) }
        : { label: t('archived'), icon: '📦', onClick: () => handleArchive(task) },
      { label: t('delete'), icon: '🗑️', color: 'text-danger', onClick: () => handleDelete(task) },
    ]
  }

  // ── Pull-to-refresh ────────────────────────────────────────
  function onTouchStart(e: React.TouchEvent) { pullStartY.current = e.touches[0].clientY }
  function onTouchMove(e: React.TouchEvent) {
    if (!listRef.current || listRef.current.scrollTop > 0) return
    if (e.touches[0].clientY - pullStartY.current < 40) return
    setIsPulling(true)
  }
  async function onTouchEnd() {
    if (!isPulling) return; setIsPulling(false); haptic.light()
    await fetchTasks(); toast.success(t('refreshed'))
  }

  if (!list) return null

  // ── Reorder status badge ────────────────────────────────────
  const reorderBadge = reorderStatus === 'pending'
    ? { show: true, icon: <ArrowUpDown size={10} />, label: '2s…', cls: 'bg-accent/10 text-accent border-accent/20' }
    : reorderStatus === 'saving'
    ? { show: true, icon: <div className="w-2.5 h-2.5 border border-current/30 border-t-current rounded-full animate-spin" />, label: t('saving'), cls: 'bg-amber/10 text-amber border-amber/20' }
    : { show: false, icon: null, label: '', cls: '' }

  const isDragMode = sortKey === 'position' && !searchQuery && filter !== 'archived' && !isViewer

  // ────────────────────────────────────────────────────────────
  //  Render
  // ────────────────────────────────────────────────────────────
  return (
    <div ref={pageRef} className="page-container">
      {showConfetti && <Confetti onDone={() => setShowConfetti(false)} />}

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-2 flex-shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <button onClick={handleBack} className="btn-ghost p-2 -ml-2"><ArrowLeft size={20} /></button>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xl flex-shrink-0" style={{ background: `${list.color}20` }}>
            {list.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h1 className="font-bold text-base truncate">{list.title}</h1>
              <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors', isOnline ? 'bg-emerald' : 'bg-danger animate-pulse')} />
              {isViewer && (
                <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-text-dim/20 text-text-secondary flex-shrink-0">
                  <Eye size={9} /> {t('viewOnly')}
                </span>
              )}
              {reorderBadge.show && (
                <span className={cn('flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border flex-shrink-0 transition-all duration-200', reorderBadge.cls)}>
                  {reorderBadge.icon}{reorderBadge.label}
                </span>
              )}
            </div>
            {totalCount > 0 && <p className="text-xs text-text-secondary">{doneCount}/{totalCount} {t('subtasksDone')}</p>}
          </div>
          <button onClick={toggleTheme} className="btn-ghost p-2">
            {theme === 'dark' ? <Sun size={17} className="text-amber" /> : <Moon size={17} />}
          </button>
          <button onClick={() => { setShowSearch(!showSearch); if (!showSearch) setTimeout(() => searchRef.current?.focus(), 100) }}
            className={cn('btn-ghost p-2', showSearch && 'text-accent bg-accent/10')}>
            <Search size={17} />
          </button>
          <button onClick={() => setShowSort(!showSort)}
            className={cn('btn-ghost p-2', sortKey !== 'position' && 'text-accent bg-accent/10')}>
            <SortAsc size={17} />
          </button>
        </div>

        {showSearch && (
          <div className="relative mb-2 animate-fade-up">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
            <input ref={searchRef} value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder={t('searchPlaceholder')} className="input-field pl-9 pr-9 py-2.5 text-sm" />
            {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim"><X size={15} /></button>}
          </div>
        )}

        {showSort && (
          <div className="flex gap-1.5 mb-2 overflow-x-auto animate-fade-up">
            {([
              { key: 'position',   label: t('sortManual')   },
              { key: 'due_at',     label: t('sortDueDate')  },
              { key: 'priority',   label: t('sortPriority') },
              { key: 'created_at', label: t('sortNewest')   },
            ] as { key: SortKey; label: string }[]).map(s => (
              <button key={s.key} onClick={() => { setSortKey(s.key); haptic.select() }}
                className={cn('px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap', sortKey === s.key ? 'bg-accent text-white' : 'bg-bg-card text-text-secondary')}>
                {s.label}
              </button>
            ))}
          </div>
        )}

        {totalCount > 0 && filter !== 'archived' && (
          <div className="h-1 bg-bg-card rounded-full overflow-hidden mb-2.5">
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${progress}%`, background: progress === 100 ? 'linear-gradient(90deg,#3ECF8E,#22B97A)' : `linear-gradient(90deg,${list.color},${list.color}cc)` }} />
          </div>
        )}

        <div className="flex gap-1 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
          {STATUS_TABS.map(tab => {
            const count = tab.key === 'all' ? activeTasks.length : tab.key === 'archived' ? archivedTasks.length : activeTasks.filter(t => t.status === tab.key).length
            return (
              <button key={tab.key} onClick={() => { setFilter(tab.key); haptic.select() }}
                className={cn('px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all',
                  filter === tab.key ? 'bg-accent text-white shadow-glow-sm' : 'text-text-secondary hover:bg-bg-hover')}>
                {tab.label}
                {count > 0 && <span className={cn('ml-1.5 text-xs', filter === tab.key ? 'opacity-80' : 'opacity-50')}>{count}</span>}
              </button>
            )
          })}
        </div>

        {!isOnline && (
          <div className="flex items-center justify-between gap-2 bg-danger/10 border border-danger/20 rounded-xl px-3 py-2 mt-2 animate-fade-up">
            <div className="flex items-center gap-2 text-xs text-danger font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-danger animate-pulse flex-shrink-0" />{t('noConnection')}
            </div>
            <button onClick={() => fetchTasks()} className="text-xs text-danger underline">{t('retry')}</button>
          </div>
        )}
        {isPulling && (
          <div className="flex items-center justify-center py-2 text-xs text-accent gap-1.5 animate-fade-up">
            <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            {t('releaseToRefresh')}
          </div>
        )}
      </div>

      {/* ── Task list ────────────────────────────────────────── */}
      <div className="flex-1 relative min-h-0">
        {isPending && <div className="absolute inset-0 z-20 bg-bg-base/30 backdrop-blur-[1px] pointer-events-auto" />}

        <div
          ref={listRef}
          className="h-full scrollable px-4 pb-24"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {loading ? (
            <div className="space-y-2 mt-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-16 skeleton rounded-2xl" style={{ animationDelay: `${i * 80}ms` }} />
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center animate-fade-up">
              <p className="text-text-dim text-sm">
                {searchQuery ? t('noTasksMatch') : filter === 'archived' ? t('nothingArchived') : t('noTasksHere')}
              </p>
              {!searchQuery && filter !== 'archived' && !isViewer && (
                <button onClick={() => setShowCreate(true)} className="mt-3 text-accent text-sm font-medium">{t('addOne')}</button>
              )}
            </div>
          ) : (
            <div ref={containerRef} className="space-y-2 mt-2">
              {slottedItems.map(({ slotId, itemId, item: task }) => (
                <div key={slotId} data-swapy-slot={slotId}>
                  <div key={itemId} data-swapy-item={itemId} className="task-item">
                    <TaskCard
                      task={task}
                      isViewer={isViewer}
                      isDragMode={isDragMode}
                      onToggle={() => handleStatusToggle(task)}
                      onOpen={() => isViewer ? setViewerTask(task) : setActiveTask(task)}
                      onLongPress={(x, y) => { setContextMenu({ task, x, y }); haptic.medium() }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── FAB ─────────────────────────────────────────────── */}
      {!isViewer && !(typeof window !== 'undefined' && window?.Telegram?.WebApp?.MainButton?.isVisible) && (
        <button
          onClick={() => { if (isPending) return; setShowCreate(true); haptic.light() }}
          disabled={isPending}
          className={cn(
            'fixed bottom-6 right-4 w-14 h-14 rounded-2xl bg-accent text-white',
            'flex items-center justify-center shadow-glow z-40',
            'active:scale-90 transition-all duration-150',
            isPending && 'opacity-40 cursor-not-allowed'
          )}
        >
          {isPending
            ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : <Plus size={24} strokeWidth={2.5} />
          }
        </button>
      )}

      {contextMenu && (
        <ContextMenu items={getContextItems(contextMenu.task)} x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} />
      )}
      {viewerTask && (
        <ViewerTaskSheet task={viewerTask} userId={user?.id ?? 0} onClose={() => setViewerTask(null)} onSubtaskToggled={() => fetchTasks(false)} />
      )}
      {(showCreate || activeTask) && (
        <TaskSheet
          listId={activeListId!}
          userId={user?.id ?? 0}
          task={activeTask ?? undefined}
          onClose={() => { setShowCreate(false); setActiveTask(null) }}
          onSaved={() => { setShowCreate(false); setActiveTask(null); fetchTasks() }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  TaskCard
// ─────────────────────────────────────────────────────────────
interface CardProps {
  task:        Task
  isViewer:    boolean
  isDragMode:  boolean
  onToggle:    () => void
  onOpen:      () => void
  onLongPress: (x: number, y: number) => void
}

function TaskCard({ task, isViewer, isDragMode, onToggle, onOpen, onLongPress }: CardProps) {
  const { t } = useI18n()

  const [isHolding, setIsHolding] = useState(false)
  const holdTimer = useRef<ReturnType<typeof setTimeout>>()

  const longPressTimer = useRef<ReturnType<typeof setTimeout>>()
  const didLongPress   = useRef(false)

  const priority   = PRIORITY_CONFIG[task.priority]
  const isDone     = task.status === 'done'
  const isArchived = task.archived
  const subDone    = task.subtasks?.filter(s => s.completed).length ?? 0
  const subTotal   = task.subtasks?.length ?? 0
  const dueAt      = task.due_at ?? task.due_date
  const creatorTz  = task.creator_tz ?? 'UTC'
  const viewerTz   = Intl.DateTimeFormat().resolvedOptions().timeZone

  let dueLabel = '', dueUrgent = false, dueOverdue = false, dueLocalLabel = ''
  if (dueAt) {
    const d = new Date(dueAt), now = new Date()
    const diff = Math.round((d.getTime() - now.getTime()) / 86400000)
    dueOverdue = diff < 0; dueUrgent = diff <= 1
    dueLabel = dueOverdue
      ? `${Math.abs(diff)}${t('dOverdue')}`
      : diff === 0 ? t('today')
      : diff === 1 ? t('tomorrow')
      : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: creatorTz })
    if (creatorTz !== viewerTz)
      dueLocalLabel = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: viewerTz })
  }

  function handleTouchStart(e: React.TouchEvent) {
    didLongPress.current = false
    const { clientX, clientY } = e.touches[0]
    longPressTimer.current = setTimeout(() => { didLongPress.current = true; onLongPress(clientX, clientY) }, 500)
  }
  function handleTouchEnd() { clearTimeout(longPressTimer.current) }
  function handleClick()    { if (!didLongPress.current) onOpen() }

  function handleGripDown() {
    holdTimer.current = setTimeout(() => setIsHolding(true), 50)
  }
  function handleGripUp() {
    clearTimeout(holdTimer.current)
    setIsHolding(false)
  }

  return (
    <div className="card-shell">
      <div className={cn(
        'card flex items-start overflow-hidden',
        isDone     && 'opacity-55',
        isArchived && 'opacity-40',
      )}>
        <div className="w-1 self-stretch flex-shrink-0 rounded-l-2xl"
          style={{ background: priority.dot, opacity: isDone ? 0.4 : 1 }} />

        <div className="flex items-start gap-2.5 p-3.5 flex-1 min-w-0">

          {isDragMode ? (
            <div
              data-swapy-handle
              onPointerDown={handleGripDown}
              onPointerUp={handleGripUp}
              onPointerLeave={handleGripUp}
              className={cn(
                'mt-0.5 flex-shrink-0 touch-none select-none cursor-grab active:cursor-grabbing',
                'relative transition-colors duration-150',
                isHolding ? 'text-accent' : 'text-text-dim hover:text-text-secondary'
              )}
            >
              <GripVertical size={15} />
              {isHolding && (
                <span className="absolute inset-[-5px] rounded-full border border-accent/50 animate-ping pointer-events-none" />
              )}
            </div>
          ) : (
            <Eye size={13} className="text-text-dim mt-1 flex-shrink-0 opacity-40" />
          )}

          <button
            onClick={isViewer ? undefined : onToggle}
            data-swapy-no-drag
            className={cn('custom-checkbox mt-0.5', isDone ? 'checked' : 'unchecked', isViewer && 'opacity-60 cursor-default')}
          >
            {isDone && (
              <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                <path d="M1 4L4 7L10 1" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>

          <button
            data-swapy-no-drag
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onClick={handleClick}
            className="flex-1 min-w-0 text-left"
          >
            <p className={cn('text-sm font-medium leading-snug', isDone && 'line-through text-text-secondary')}>
              {task.title}
            </p>
            {task.description && !isDone && (
              <p className="text-xs text-text-dim mt-0.5 truncate">
                <MentionText text={task.description} />
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
              <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', priority.color, priority.bg)}>
                {priority.label}
              </span>
              {task.assigned_user && (
                <span className="text-xs text-text-secondary flex items-center gap-1">
                  <div className="w-4 h-4 rounded-full bg-accent/20 text-accent flex items-center justify-center text-[9px] font-bold flex-shrink-0">
                    {task.assigned_user.first_name[0]?.toUpperCase()}
                  </div>
                  {task.assigned_user.first_name.split(' ')[0]}
                </span>
              )}
              {dueAt && (
                <span className={cn('text-xs flex items-center gap-1',
                  dueOverdue ? 'text-danger' : dueUrgent ? 'text-amber' : 'text-text-secondary')}>
                  <Calendar size={11} />{dueLabel}
                  {dueLocalLabel && <span className="text-accent ml-0.5">· {dueLocalLabel}</span>}
                </span>
              )}
              {subTotal > 0 && (
                <span className="text-xs text-text-secondary flex items-center gap-1">
                  <CheckCircle2 size={11} />{subDone}/{subTotal}
                </span>
              )}
              {isArchived && <span className="text-xs text-text-dim">📦 {t('archived')}</span>}
            </div>
          </button>

        </div>
      </div>
    </div>
  )
}

function MentionText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(@[a-zA-Z0-9_]+)/g).map((p, i) =>
        /^@[a-zA-Z0-9_]+$/.test(p)
          ? <span key={i} className="text-accent font-medium">{p}</span>
          : <span key={i}>{p}</span>
      )}
    </>
  )
}