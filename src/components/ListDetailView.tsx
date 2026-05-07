'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { gsap } from 'gsap'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '@/lib/supabase'
import { useTaskStore } from '@/lib/store'
import { useTelegram } from '@/hooks/useTelegram'
import { PRIORITY_CONFIG, cn } from '@/lib/utils'
import {
  ArrowLeft, Plus, Share2, Download, GripVertical,
  Archive, ArchiveRestore, Search, X, SortAsc,
  Calendar, CheckCircle2, Wifi, WifiOff,
} from 'lucide-react'
import { TaskSheet }   from '@/components/TaskSheet'
import { ShareSheet }  from '@/components/ShareSheet'
import { ContextMenu, type ContextMenuItem } from '@/components/ContextMenu'
import { Confetti }    from '@/components/Confetti'
import type { Task, TaskStatus, Priority } from '@/types'
import { toast } from 'sonner'

interface Props { onBack: () => void }

type SortKey = 'position' | 'due_at' | 'priority' | 'created_at'
type FilterKey = TaskStatus | 'all' | 'archived'

const STATUS_TABS: { key: FilterKey; label: string }[] = [
  { key: 'all',        label: 'All'      },
  { key: 'todo',       label: 'To Do'    },
  { key: 'in_progress', label: 'Doing'   },
  { key: 'done',       label: 'Done'     },
  { key: 'archived',   label: '📦 Archive' },
]

const PRIORITY_ORDER: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

export function ListDetailView({ onBack }: Props) {
  const { user, haptic } = useTelegram()
  const { lists, tasks, activeListId, setTasks, updateTask, removeTask, reorderTasks } = useTaskStore()
  const list = lists.find(l => l.id === activeListId)

  const [filter,      setFilter]     = useState<FilterKey>('all')
  const [sortKey,     setSortKey]    = useState<SortKey>('position')
  const [loading,     setLoading]    = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch,  setShowSearch]  = useState(false)
  const [showSort,    setShowSort]    = useState(false)
  const [activeTask,  setActiveTask]  = useState<Task | null>(null)
  const [showCreate,  setShowCreate]  = useState(false)
  const [showShare,   setShowShare]   = useState(false)
  const [isOnline,    setIsOnline]    = useState(true)
  const [showConfetti, setShowConfetti] = useState(false)
  const [contextMenu, setContextMenu]  = useState<{ task: Task; x: number; y: number } | null>(null)
  const [isPulling,   setIsPulling]   = useState(false)

  const pageRef    = useRef<HTMLDivElement>(null)
  const listRef    = useRef<HTMLDivElement>(null)
  const searchRef  = useRef<HTMLInputElement>(null)
  const pullStartY = useRef(0)
  const wasDone    = useRef(false)

  const allTasks     = tasks[activeListId!] ?? []
  const activeTasks  = allTasks.filter(t => !t.archived)
  const archivedTasks = allTasks.filter(t => t.archived)

  // Filtered + sorted + searched
  const baseList = filter === 'archived' ? archivedTasks
    : filter === 'all' ? activeTasks
    : activeTasks.filter(t => t.status === filter)

  const searched = searchQuery.trim()
    ? baseList.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : baseList

  const sorted = [...searched].sort((a, b) => {
    if (sortKey === 'due_at') {
      const da = a.due_at ?? a.due_date ?? ''
      const db_ = b.due_at ?? b.due_date ?? ''
      if (!da) return 1; if (!db_) return -1
      return da.localeCompare(db_)
    }
    if (sortKey === 'priority') return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    if (sortKey === 'created_at') return b.created_at.localeCompare(a.created_at)
    return a.position - b.position
  })

  const doneCount  = activeTasks.filter(t => t.status === 'done').length
  const totalCount = activeTasks.length
  const progress   = totalCount ? Math.round((doneCount / totalCount) * 100) : 0

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  // ── Telegram buttons ───────────────────────────────────────
  useEffect(() => {
    const tg = window?.Telegram?.WebApp
    if (!tg) return

    // MainButton → create task
    tg.MainButton.setText('+ New Task')
    tg.MainButton.show()
    tg.MainButton.onClick(() => { setShowCreate(true); haptic.light() })

    // BackButton
    tg.BackButton.show()
    tg.BackButton.onClick(handleBack)

    return () => {
      tg.MainButton.hide()
      tg.MainButton.offClick(() => {})
      tg.BackButton.hide()
      tg.BackButton.offClick(handleBack)
    }
  }, [])

  // ── Page entrance ──────────────────────────────────────────
  useEffect(() => {
    gsap.fromTo(pageRef.current,
      { x: 40, opacity: 0 },
      { x: 0, opacity: 1, duration: 0.32, ease: 'power3.out' }
    )
  }, [])

  // ── Fetch + realtime ───────────────────────────────────────
  useEffect(() => {
    if (!activeListId || !user) return
    fetchTasks()

    const channel = supabase
      .channel(`tasks-${activeListId}`)
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'tasks', filter: `list_id=eq.${activeListId}` }, fetchTasks)
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'subtasks' }, fetchTasks)
      .subscribe((status: string) => setIsOnline(status === 'SUBSCRIBED'))

    return () => { supabase.removeChannel(channel) }
  }, [activeListId, user])

  async function fetchTasks(showAnim = true) {
    const res  = await fetch(`/api/tasks?listId=${activeListId}&userId=${user?.id ?? 0}`)
    const data = await res.json()

    // Also fetch archived
    const resA  = await fetch(`/api/tasks?listId=${activeListId}&userId=${user?.id ?? 0}&archived=true`)
    const dataA = await resA.json()

    const combined = [...(data.tasks ?? []), ...(dataA.tasks ?? [])]
    setTasks(activeListId!, combined)
    setLoading(false)

    if (showAnim) {
      requestAnimationFrame(() => {
        const cards = listRef.current?.querySelectorAll('.task-item')
        if (cards?.length) {
          gsap.fromTo(cards,
            { x: -14, opacity: 0 },
            { x: 0, opacity: 1, duration: 0.26, stagger: 0.04, ease: 'power2.out' }
          )
        }
      })
    }

    // Confetti if all done (and weren't before)
    const tasks_ = data.tasks ?? []
    const allDone = tasks_.length > 0 && tasks_.every((t: Task) => t.status === 'done')
    if (allDone && !wasDone.current) { setShowConfetti(true); haptic.success() }
    wasDone.current = allDone
  }

  function handleBack() {
    haptic.light()
    window?.Telegram?.WebApp?.BackButton?.hide()
    window?.Telegram?.WebApp?.MainButton?.hide()
    gsap.to(pageRef.current, { x: 40, opacity: 0, duration: 0.22, ease: 'power2.in', onComplete: onBack })
  }

  // ── Pull-to-refresh ────────────────────────────────────────
  function onTouchStart(e: React.TouchEvent) { pullStartY.current = e.touches[0].clientY }
  function onTouchMove(e: React.TouchEvent) {
    const delta = e.touches[0].clientY - pullStartY.current
    const el    = listRef.current
    if (!el || el.scrollTop > 0 || delta < 40) return
    setIsPulling(true)
  }
  async function onTouchEnd() {
    if (!isPulling) return
    setIsPulling(false)
    haptic.light()
    await fetchTasks()
    toast.success('Refreshed')
  }

  // ── Status toggle ──────────────────────────────────────────
  async function handleStatusToggle(task: Task) {
    const next: TaskStatus = task.status === 'done' ? 'todo' : 'done'
    updateTask(task.id, { status: next })
    if (next === 'done') haptic.success()
    else haptic.medium()
    await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: task.id, userId: user?.id ?? 0, status: next }),
    })
    // Re-check confetti
    const updated = (tasks[activeListId!] ?? []).map(t => t.id === task.id ? { ...t, status: next } : t)
    const activeDone = updated.filter(t => !t.archived)
    if (activeDone.length > 0 && activeDone.every(t => t.status === 'done')) {
      setShowConfetti(true); haptic.success()
    }
  }

  // ── Archive / delete ───────────────────────────────────────
  async function handleArchive(task: Task) {
    updateTask(task.id, { archived: true })
    haptic.medium()
    await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: task.id, userId: user?.id ?? 0, archived: true }),
    })
    toast.success('Archived')
  }

  async function handleUnarchive(task: Task) {
    updateTask(task.id, { archived: false })
    haptic.medium()
    await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: task.id, userId: user?.id ?? 0, archived: false }),
    })
    toast.success('Restored')
  }

  async function handleDelete(task: Task) {
    const el = document.getElementById(`task-${task.id}`)
    if (el) await gsap.to(el, { x: 40, opacity: 0, height: 0, marginBottom: 0, duration: 0.22, ease: 'power2.in' })
    removeTask(task.id, task.list_id)
    haptic.heavy()
    await fetch(`/api/tasks?taskId=${task.id}&userId=${user?.id ?? 0}`, { method: 'DELETE' })
    toast.success('Deleted')
  }

  // ── Priority change ────────────────────────────────────────
  async function handlePriorityChange(task: Task, priority: Priority) {
    updateTask(task.id, { priority })
    haptic.select()
    await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: task.id, userId: user?.id ?? 0, priority }),
    })
  }

  // ── Drag reorder ───────────────────────────────────────────
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const curr = tasks[activeListId!] ?? []
    const oldIdx = curr.findIndex(t => t.id === active.id)
    const newIdx = curr.findIndex(t => t.id === over.id)
    const reordered = arrayMove(curr, oldIdx, newIdx)
    reorderTasks(activeListId!, reordered)
    haptic.select()
    await Promise.all(reordered.map((t, i) =>
      fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: t.id, userId: user?.id ?? 0, position: i }),
      })
    ))
  }

  // ── Export ─────────────────────────────────────────────────
  async function handleExport() {
    haptic.light()
    const res  = await fetch(`/api/export?listId=${activeListId}&userId=${user?.id ?? 0}`)
    const text = await res.text()
    const tg   = window?.Telegram?.WebApp
    if (navigator.share) {
      await navigator.share({ title: list?.title, text })
    } else if (tg?.sendData) {
      tg.sendData(text.slice(0, 4096))
    } else {
      await navigator.clipboard.writeText(text)
      toast.success('Copied to clipboard!')
    }
  }

  // ── Context menu items ─────────────────────────────────────
  function getContextItems(task: Task): ContextMenuItem[] {
    const statusItems: ContextMenuItem[] = task.status !== 'done'
      ? [{ label: 'Mark as Done', icon: '✅', onClick: () => handleStatusToggle(task) }]
      : [{ label: 'Mark as To Do', icon: '⬜', onClick: () => handleStatusToggle(task) }]

    const priorityItems: ContextMenuItem[] = [
      { label: 'Urgent',  icon: '🔴', onClick: () => handlePriorityChange(task, 'urgent') },
      { label: 'High',    icon: '🟠', onClick: () => handlePriorityChange(task, 'high')   },
      { label: 'Medium',  icon: '🟡', onClick: () => handlePriorityChange(task, 'medium') },
      { label: 'Low',     icon: '⚪', onClick: () => handlePriorityChange(task, 'low')    },
    ].filter(i => i.label.toLowerCase() !== task.priority)

    const archiveItem: ContextMenuItem = task.archived
      ? { label: 'Restore',  icon: '📤', onClick: () => handleUnarchive(task) }
      : { label: 'Archive',  icon: '📦', onClick: () => handleArchive(task)   }

    return [
      { label: 'Edit',   icon: '✏️',  onClick: () => setActiveTask(task) },
      ...statusItems,
      ...priorityItems.slice(0, 2),
      archiveItem,
      { label: 'Delete', icon: '🗑️', color: 'text-danger', onClick: () => handleDelete(task) },
    ]
  }

  if (!list) return null

  return (
    <div ref={pageRef} className="page-container">
      {showConfetti && <Confetti onDone={() => setShowConfetti(false)} />}

      {/* Header */}
      <div className="px-4 pt-3 pb-2 flex-shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <button onClick={handleBack} className="btn-ghost p-2 -ml-2">
            <ArrowLeft size={20} />
          </button>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
            style={{ background: `${list.color}20` }}>
            {list.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="font-bold text-base truncate">{list.title}</h1>
              <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0',
                isOnline ? 'bg-emerald animate-pulse' : 'bg-text-dim')}
                title={isOnline ? 'Live sync' : 'Offline'} />
            </div>
            {totalCount > 0 && (
              <p className="text-xs text-text-secondary">{doneCount}/{totalCount} done</p>
            )}
          </div>

          <button onClick={() => { setShowSearch(!showSearch); if (!showSearch) setTimeout(() => searchRef.current?.focus(), 100) }}
            className={cn('btn-ghost p-2', showSearch && 'text-accent bg-accent/10')}>
            <Search size={17} />
          </button>
          <button onClick={() => setShowSort(!showSort)}
            className={cn('btn-ghost p-2', sortKey !== 'position' && 'text-accent bg-accent/10')}>
            <SortAsc size={17} />
          </button>
          <button onClick={handleExport}  className="btn-ghost p-2"><Download size={17} /></button>
          <button onClick={() => { setShowShare(true); haptic.light() }} className="btn-ghost p-2">
            <Share2 size={17} />
          </button>
        </div>

        {/* Search bar */}
        {showSearch && (
          <div className="relative mb-2 animate-fade-up">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
            <input ref={searchRef} value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search tasks…"
              className="input-field pl-9 pr-9 py-2.5 text-sm" />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim">
                <X size={15} />
              </button>
            )}
          </div>
        )}

        {/* Sort options */}
        {showSort && (
          <div className="flex gap-1.5 mb-2 overflow-x-auto animate-fade-up">
            {([
              { key: 'position',   label: 'Manual'   },
              { key: 'due_at',     label: 'Due date' },
              { key: 'priority',   label: 'Priority' },
              { key: 'created_at', label: 'Newest'   },
            ] as { key: SortKey; label: string }[]).map(s => (
              <button key={s.key} onClick={() => { setSortKey(s.key); haptic.select() }}
                className={cn('px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap',
                  sortKey === s.key ? 'bg-accent text-white' : 'bg-bg-card text-text-secondary'
                )}>
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* Progress bar */}
        {totalCount > 0 && filter !== 'archived' && (
          <div className="h-1 bg-bg-card rounded-full overflow-hidden mb-2.5">
            <div className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${progress}%`,
                background: progress === 100
                  ? 'linear-gradient(90deg,#34D399,#10B981)'
                  : `linear-gradient(90deg,${list.color},${list.color}cc)`,
              }} />
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-1 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
          {STATUS_TABS.map(tab => {
            const count = tab.key === 'all' ? activeTasks.length
              : tab.key === 'archived' ? archivedTasks.length
              : activeTasks.filter(t => t.status === tab.key).length
            return (
              <button key={tab.key} onClick={() => { setFilter(tab.key); haptic.select() }}
                className={cn('px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-200',
                  filter === tab.key ? 'bg-accent text-white shadow-glow-sm' : 'text-text-secondary hover:bg-bg-hover'
                )}>
                {tab.label}
                {count > 0 && <span className={cn('ml-1.5 text-xs', filter === tab.key ? 'opacity-80' : 'opacity-50')}>{count}</span>}
              </button>
            )
          })}
        </div>

        {/* Pull-to-refresh indicator */}
        {isPulling && (
          <div className="flex items-center justify-center py-2 text-xs text-accent gap-1.5 animate-fade-up">
            <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            Release to refresh
          </div>
        )}
      </div>

      {/* Task list */}
      <div ref={listRef} className="flex-1 scrollable px-4 pb-24"
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        {loading ? (
          <div className="space-y-2 mt-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 skeleton rounded-2xl" style={{ animationDelay: `${i * 80}ms` }} />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center animate-fade-up">
            <p className="text-text-dim text-sm">
              {searchQuery ? 'No tasks match your search' : filter === 'archived' ? 'Nothing archived' : 'No tasks here'}
            </p>
            {!searchQuery && filter !== 'archived' && (
              <button onClick={() => setShowCreate(true)} className="mt-3 text-accent text-sm font-medium">+ Add one</button>
            )}
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={sorted.map(t => t.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2 mt-2">
                {sorted.map(task => (
                  <SortableTaskCard
                    key={task.id}
                    task={task}
                    onToggle={() => handleStatusToggle(task)}
                    onOpen={() => setActiveTask(task)}
                    onLongPress={(x, y) => { setContextMenu({ task, x, y }); haptic.medium() }}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* FAB — only if Telegram MainButton not available */}
      {!(typeof window !== 'undefined' && window?.Telegram?.WebApp?.MainButton?.isVisible) && (
        <button
          onClick={() => { setShowCreate(true); haptic.light() }}
          className="fixed bottom-6 right-4 w-14 h-14 rounded-2xl bg-accent text-white
                     flex items-center justify-center shadow-glow z-40
                     active:scale-90 transition-transform duration-150"
        >
          <Plus size={24} strokeWidth={2.5} />
        </button>
      )}

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          items={getContextItems(contextMenu.task)}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Modals */}
      {(showCreate || activeTask) && (
        <TaskSheet
          listId={activeListId!}
          userId={user?.id ?? 0}
          task={activeTask ?? undefined}
          onClose={() => { setShowCreate(false); setActiveTask(null) }}
          onSaved={() => { setShowCreate(false); setActiveTask(null); fetchTasks() }}
        />
      )}
      {showShare && (
        <ShareSheet listId={activeListId!} userId={user?.id ?? 0} onClose={() => setShowShare(false)} />
      )}
    </div>
  )
}

// ── Sortable Task Card ──────────────────────────────────────────
interface CardProps {
  task:        Task
  onToggle:    () => void
  onOpen:      () => void
  onLongPress: (x: number, y: number) => void
}

function SortableTaskCard({ task, onToggle, onOpen, onLongPress }: CardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>()
  const didLongPress   = useRef(false)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? 'transform 200ms cubic-bezier(0.25,1,0.5,1)',
    opacity: isDragging ? 0.45 : 1,
    zIndex:  isDragging ? 10 : undefined,
  }

  const priority    = PRIORITY_CONFIG[task.priority]
  const isDone      = task.status === 'done'
  const isArchived  = task.archived
  const subDone     = task.subtasks?.filter(s => s.completed).length ?? 0
  const subTotal    = task.subtasks?.length ?? 0

  // Due date display with dual timezone
  const dueAt      = task.due_at ?? task.due_date
  const creatorTz  = task.creator_tz ?? 'UTC'
  const viewerTz   = Intl.DateTimeFormat().resolvedOptions().timeZone
  let dueLabel = '', dueUrgent = false, dueOverdue = false, dueLocalLabel = ''

  if (dueAt) {
    const d    = new Date(dueAt)
    const now  = new Date()
    const diff = Math.round((d.getTime() - now.getTime()) / 86400000)
    dueOverdue = diff < 0
    dueUrgent  = diff <= 1
    dueLabel   = dueOverdue ? `${Math.abs(diff)}d overdue`
      : diff === 0 ? 'Today'
      : diff === 1 ? 'Tomorrow'
      : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: creatorTz })
    if (creatorTz !== viewerTz) {
      dueLocalLabel = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: viewerTz })
    }
  }

  function handleTouchStart(e: React.TouchEvent) {
    didLongPress.current = false
    const { clientX, clientY } = e.touches[0]
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true
      onLongPress(clientX, clientY)
    }, 500)
  }

  function handleTouchEnd() {
    clearTimeout(longPressTimer.current)
  }

  function handleClick() {
    if (didLongPress.current) return
    onOpen()
  }

  return (
    <div ref={setNodeRef} style={style} id={`task-${task.id}`} className="task-item">
      <div className={cn(
        'card flex items-start overflow-hidden',
        isDone && 'opacity-55',
        isArchived && 'opacity-40',
        isDragging && 'shadow-glow',
      )}>
        {/* Priority stripe */}
        <div className="w-1 self-stretch flex-shrink-0 rounded-l-2xl"
          style={{ background: priority.dot, opacity: isDone ? 0.4 : 1 }} />

        <div className="flex items-start gap-2.5 p-3.5 flex-1 min-w-0">
          {/* Drag */}
          <button {...attributes} {...listeners}
            className="text-text-dim mt-0.5 flex-shrink-0 touch-none cursor-grab active:cursor-grabbing">
            <GripVertical size={15} />
          </button>

          {/* Checkbox */}
          <button onClick={onToggle} className={cn('custom-checkbox mt-0.5', isDone ? 'checked' : 'unchecked')}>
            {isDone && (
              <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                <path d="M1 4L4 7L10 1" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>

          {/* Content */}
          <button
            onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}
            onClick={handleClick}
            className="flex-1 min-w-0 text-left"
          >
            <p className={cn('text-sm font-medium leading-snug', isDone && 'line-through text-text-secondary')}>
              {task.title}
            </p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
              <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', priority.color, priority.bg)}>
                {priority.label}
              </span>
              {dueAt && (
                <span className={cn('text-xs flex items-center gap-1',
                  dueOverdue ? 'text-danger' : dueUrgent ? 'text-amber' : 'text-text-secondary')}>
                  <Calendar size={11} />
                  {dueLabel}
                  {dueLocalLabel && (
                    <span className="text-accent ml-0.5">· {dueLocalLabel}</span>
                  )}
                </span>
              )}
              {subTotal > 0 && (
                <span className="text-xs text-text-secondary flex items-center gap-1">
                  <CheckCircle2 size={11} />{subDone}/{subTotal}
                </span>
              )}
              {isArchived && (
                <span className="text-xs text-text-dim">📦 archived</span>
              )}
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}