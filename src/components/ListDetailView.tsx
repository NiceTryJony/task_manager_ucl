'use client'

/**
 * ListDetailView
 *
 * Исправлено по сравнению с предыдущей версией:
 * - Добавлены handleOpenAsViewer / handleOpenAsEditor (useCallback) —
 *   устраняет создание новой функции на каждый элемент map, memo TaskCard
 *   перестаёт ломаться при каждом рендере
 * - Устранена коллизия имён: параметр `t` в onOpen-колбэках (тень useI18n's `t`)
 *   переименован в `openedTask`
 * - fetchTasks / flushReorderSave — в useCallback с явными зависимостями
 * - Пустой catch → console.error с контекстом
 * - AbortError обрабатывается в flushReorderSave (не показываем toast при отмене)
 * - dragActivatorRef пробрасывается через SortableTaskCard → TaskCard → grip-handle
 */

import {
  useEffect, useRef, useState, useMemo,
  useCallback, memo
} from 'react'
import { gsap } from 'gsap'
import {
  DndContext, DragOverlay,
  PointerSensor, TouchSensor, KeyboardSensor,
  MeasuringStrategy, pointerWithin,
  useSensor, useSensors,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { supabase }         from '@/lib/supabase'
import { apiFetch }         from '@/lib/api-client'
import { useTaskStore }     from '@/lib/store'
import { useTelegram }      from '@/hooks/useTelegram'
import { cn }               from '@/lib/utils'
import {
  ArrowLeft, Plus, Search, X, SortAsc,
  Eye, Sun, Moon,
} from 'lucide-react'
import { TaskSheet }          from '@/components/TaskSheet'
import { ViewerTaskSheet }    from '@/components/ViewerTaskSheet'
import { ContextMenu, type ContextMenuItem } from '@/components/ContextMenu'
import { Confetti }           from '@/components/Confetti'
import { TaskCard }           from '@/components/tasks/TaskCard'
import { SortableTaskCard }   from '@/components/tasks/SortableTaskCard'
import { SwipeableTaskCard }  from '@/components/SwipeableTaskCard'
import type { Task, TaskStatus, Priority, MemberRole } from '@/types'
import { toast }          from 'sonner'
import { usePending }     from '@/hooks/usePending'
import { useTheme }       from '@/lib/theme-context'
import { useI18n }        from '@/lib/i18n-context'
import { SaveBanner }     from '@/components/ui/SaveBanner'
import { VirtualList } from '@/components/VirtualItem'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props { onBack: () => void }

type SortKey       = 'position' | 'due_at' | 'priority' | 'created_at'
type FilterKey     = TaskStatus | 'all' | 'archived'
type ReorderStatus = 'idle' | 'pending' | 'saving'

const PRIORITY_ORDER: Record<Priority, number> = {
  urgent: 0, high: 1, medium: 2, low: 3,
}

// ── CSS stagger animation — ноль GSAP DOM-запросов ───────────────────────────

const TASK_ANIM_STYLE = `
  @keyframes _task-slide-in {
    from { transform: translateX(-14px); opacity: 0; }
    to   { transform: translateX(0);    opacity: 1; }
  }
  .tasks-animate .task-item {
    animation: _task-slide-in 0.24s ease-out both;
  }
  .tasks-animate .task-item:nth-child(1)  { animation-delay:   0ms; }
  .tasks-animate .task-item:nth-child(2)  { animation-delay:  40ms; }
  .tasks-animate .task-item:nth-child(3)  { animation-delay:  80ms; }
  .tasks-animate .task-item:nth-child(4)  { animation-delay: 120ms; }
  .tasks-animate .task-item:nth-child(5)  { animation-delay: 160ms; }
  .tasks-animate .task-item:nth-child(6)  { animation-delay: 200ms; }
  .tasks-animate .task-item:nth-child(7)  { animation-delay: 240ms; }
  .tasks-animate .task-item:nth-child(8)  { animation-delay: 280ms; }
  .tasks-animate .task-item:nth-child(n+9){ animation-delay: 320ms; }
`

// ── ListDetailView ────────────────────────────────────────────────────────────


interface TaskRowProps {
  task:          Task
  userId:        number
  isViewer:      boolean
  isDragMode:    boolean
  draggingId:    string | null
  viewedTaskIds: Set<string>
  isSwipingRef:  React.MutableRefObject<boolean>
  onSwipeLeftDeep?: (task: Task) => void
  onSwipeRight:  (task: Task) => void
  onSwipeLeft:   (task: Task) => void
  onToggle:      (task: Task) => void
  onOpen:        (task: Task) => void
  onLongPress:   (task: Task, x: number, y: number) => void
}

const TaskRow = memo(function TaskRow({
  task, userId, isViewer, isDragMode, draggingId,
  viewedTaskIds, isSwipingRef,
  onSwipeRight, onSwipeLeft, onSwipeLeftDeep,
  onToggle, onOpen, onLongPress,
}: TaskRowProps) {
  const handleSwipeRight  = useCallback(() => onSwipeRight(task),  [task, onSwipeRight])
  const handleSwipeLeft   = useCallback(() => onSwipeLeft(task),   [task, onSwipeLeft])
  const handleSwipeStart  = useCallback(() => { isSwipingRef.current = true }, [isSwipingRef])
  const handleSwipeEnd    = useCallback(() => { setTimeout(() => { isSwipingRef.current = false }, 50) }, [isSwipingRef])
  const handleLongPress   = useCallback((x: number, y: number) => onLongPress(task, x, y), [task, onLongPress])
  const handleSwipeLeftDeep   = useCallback(() => onSwipeLeftDeep?.(task), [task, onSwipeLeftDeep])

  return (
    <SwipeableTaskCard
      onSwipeRight={handleSwipeRight}
      onSwipeLeft={handleSwipeLeft}
      disabled={isDragMode && !!draggingId}
      isDraggingGlobal={!!draggingId}
      onSwipeStart={handleSwipeStart}
      onSwipeEnd={handleSwipeEnd}
      onSwipeLeftDeep={handleSwipeLeftDeep}
    >
      <SortableTaskCard
        task={task}
        isUnread={!viewedTaskIds.has(task.id)}
        userId={userId}
        isViewer={isViewer}
        isDragMode={isDragMode}
        isDragging={draggingId === task.id}
        onToggle={onToggle}
        onOpen={onOpen}
        onLongPress={handleLongPress}
        isSwiping={isSwipingRef}
      />
    </SwipeableTaskCard>
  )
})


export function ListDetailView({ onBack }: Props) {
  const { theme, toggleTheme } = useTheme()
  const { t } = useI18n()

  const STATUS_TABS = useMemo<{ key: FilterKey; label: string }[]>(() => [
    { key: 'all',         label: t('filter_all')     },
    { key: 'todo',        label: t('filter_todo')    },
    //{ key: 'in_progress', label: t('filter_doing')   },
    { key: 'done',        label: t('filter_done')    },
    { key: 'archived',    label: t('filter_archive') },
  ], [t])

  const { user, haptic } = useTelegram()
  const {
    lists, tasks, activeListId,
    setTasks, updateTask, removeTask, reorderTasks,
    incrementPending, decrementPending,
    pendingTaskId, setPendingTaskId,
  } = useTaskStore()

  const list = lists.find(l => l.id === activeListId)

  // ── UI state ──────────────────────────────────────────────────────────────
  const [myRole,         setMyRole]         = useState<MemberRole>('viewer')
  const [filter,         setFilter]         = useState<FilterKey>('all')
  const [sortKey,        setSortKey]        = useState<SortKey>('position')
  const [loading,        setLoading]        = useState(true)
  // const [searchQuery,    setSearchQuery]    = useState('')
  const SEARCH_KEY = `taskflow_search_${activeListId}`
  const [searchQuery, setSearchQuery] = useState(
    () => localStorage.getItem(SEARCH_KEY) ?? ''
  )
  const [showSearch,     setShowSearch]     = useState(false)
  const [showSort,       setShowSort]       = useState(false)
  const [activeTask,     setActiveTask]     = useState<Task | null>(null)
  const [showCreate,     setShowCreate]     = useState(false)
  const [isOnline,       setIsOnline]       = useState(true)
  const [showConfetti,   setShowConfetti]   = useState(false)
  const [contextMenu,    setContextMenu]    = useState<{ task: Task; x: number; y: number } | null>(null)
  const [isPulling,      setIsPulling]      = useState(false)
  const [viewerTask,     setViewerTask]     = useState<Task | null>(null)
  const [viewedTaskIds,  setViewedTaskIds]  = useState<Set<string>>(new Set())
  const [tasksAnimClass, setTasksAnimClass] = useState(false)

  // ── DnD state ─────────────────────────────────────────────────────────────
  const [draggingId,    setDraggingId]    = useState<string | null>(null)
  const [reorderStatus, setReorderStatus] = useState<ReorderStatus>('idle')

  // ── Refs ───────────────────────────────────────────────────────────────────
  const pageRef             = useRef<HTMLDivElement>(null)
  const listRef             = useRef<HTMLDivElement>(null)
  const searchRef           = useRef<HTMLInputElement>(null)
  const pullStartY          = useRef(0)
  const wasDone             = useRef(false)
  const animTimerRef        = useRef<ReturnType<typeof setTimeout>>()
  const fetchDebounceRef    = useRef<ReturnType<typeof setTimeout>>()
  const abortRef            = useRef<AbortController>()
  const isSwipingRef        = useRef(false)
  const frozenSortedRef     = useRef<Task[]>([])
  const isDraggingRef       = useRef(false)
  const sortedRef           = useRef<Task[]>([])
  const reorderAbortRef     = useRef<AbortController>()
  const pendingOrderRef     = useRef<Task[] | null>(null)
  const originalOrderRef    = useRef<Task[] | null>(null)
  const wantsToGoBackRef    = useRef(false)
  const reorderDebounceRef  = useRef<ReturnType<typeof setTimeout>>()
  const onlineDebounceRef = useRef<ReturnType<typeof setTimeout>>()

  // Stable userId / listId refs — предотвращают stale-closures в async handlers
  const userIdRef = useRef(user?.id ?? 0)
  const listIdRef = useRef(activeListId)
  useEffect(() => { userIdRef.current = user?.id ?? 0 }, [user?.id])
  useEffect(() => { listIdRef.current = activeListId  }, [activeListId])

  // ── Derived task lists ────────────────────────────────────────────────────
  const allTasks      = tasks[activeListId!] ?? []
  const activeTasks   = useMemo(() => allTasks.filter(t => !t.archived), [allTasks])
  const archivedTasks = useMemo(() => allTasks.filter(t => t.archived),  [allTasks])

  const baseList = useMemo(() =>
    filter === 'archived' ? archivedTasks
    : filter === 'all'    ? activeTasks
    : activeTasks.filter(task => task.status === filter)
  , [filter, activeTasks, archivedTasks])

  const searched = useMemo(() => searchQuery.trim()
    ? baseList.filter(task => task.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : baseList
  , [baseList, searchQuery])

  const sorted = useMemo(() => [...searched].sort((a, b) => {
    if (sortKey === 'due_at') {
      const da = a.due_at ?? a.due_date ?? ''
      const db = b.due_at ?? b.due_date ?? ''
      if (!da) return 1; if (!db) return -1
      return da.localeCompare(db)
    }
    if (sortKey === 'priority')   return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    if (sortKey === 'created_at') return b.created_at.localeCompare(a.created_at)
    return a.position - b.position
  }), [searched, sortKey])

  sortedRef.current = sorted

  const displayList = useMemo(
    () => draggingId ? frozenSortedRef.current : sorted,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draggingId, sorted],
  )

  const draggingTask = useMemo(
    () => draggingId
      ? frozenSortedRef.current.find(task => task.id === draggingId) ?? null
      : null,
    [draggingId],
  )

  const sortedIds = useMemo(() => displayList.map(task => task.id), [displayList])

  // ── Stats ─────────────────────────────────────────────────────────────────
  const { doneCount, totalCount } = useMemo(() => ({
    doneCount:  activeTasks.filter(task => task.status === 'done').length,
    totalCount: activeTasks.length,
  }), [activeTasks])

  const progress   = totalCount ? Math.round((doneCount / totalCount) * 100) : 0
  const isViewer   = myRole === 'viewer'
  const { run, isPending } = usePending()
  const isBlocked  = isPending || reorderStatus === 'saving'
  const isDragMode = (
    sortKey === 'position' &&
    !searchQuery &&
    filter !== 'archived' &&
    !isViewer &&
    !isBlocked
  )

  // ── dnd-kit sensors ───────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor,  { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,    { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // ────────────────────────────────────────────────────────────────────────
  //  navigateBack — базовый, вызывается из handleBack и flushReorderSave
  // ────────────────────────────────────────────────────────────────────────
  const navigateBack = useCallback(() => {
    haptic.light()
    window?.Telegram?.WebApp?.BackButton?.hide()
    window?.Telegram?.WebApp?.MainButton?.hide()
    gsap.to(pageRef.current, {
      x: 40, opacity: 0, duration: 0.22, ease: 'power2.in',
      onComplete: onBack,
    })
  }, [haptic, onBack])

  // ────────────────────────────────────────────────────────────────────────
  //  fetchTasks — useCallback с явными deps, стабильная ссылка для useEffect
  // ────────────────────────────────────────────────────────────────────────
  const fetchTasks = useCallback(async (showAnim = true) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    const currentListId = listIdRef.current
    const currentUserId = userIdRef.current
    if (!currentListId) return

    try {
      const [res, resArchived] = await Promise.all([
        apiFetch(
          `/api/tasks?listId=${currentListId}&userId=${currentUserId}`,
          { signal: ctrl.signal },
        ),
        apiFetch(
          `/api/tasks?listId=${currentListId}&userId=${currentUserId}&archived=true`,
          { signal: ctrl.signal },
        ),
      ])

      const [data, dataArchived] = await Promise.all([
        res.json(),
        resArchived.json(),
      ])

      setTasks(currentListId, [
        ...(data.tasks         ?? []),
        ...(dataArchived.tasks ?? []),
      ])

      // Batch-запрос просмотров (fire-and-forget, не блокирует)
      apiFetch(`/api/tasks/views/batch?listId=${currentListId}`)
        .then(r => r.json())
        .then(d => setViewedTaskIds(new Set(d.viewedTaskIds ?? [])))
        .catch(err => console.warn('[fetchTasks] views/batch failed:', err))

      setLoading(false)

      // CSS stagger animation при первичной загрузке
      if (showAnim && listRef.current) {
        clearTimeout(animTimerRef.current)
        setTasksAnimClass(true)
        animTimerRef.current = setTimeout(() => setTasksAnimClass(false), 600)
      }

      // Confetti когда ВСЕ активные задачи выполнены
      const activeFetched = data.tasks ?? []
      const allDone = (
        activeFetched.length > 0 &&
        activeFetched.every((task: Task) => task.status === 'done')
      )
      if (allDone && !wasDone.current) {
        setShowConfetti(true)
        haptic.success()
      }
      wasDone.current = allDone

    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      // Не показываем toast при фоновом realtime-обновлении — логируем
      console.error('[fetchTasks] error:', err)
    }
  }, [haptic, setTasks])

  // ────────────────────────────────────────────────────────────────────────
  //  flushReorderSave — в useCallback, зависит от navigateBack
  // ────────────────────────────────────────────────────────────────────────
  const flushReorderSave = useCallback(async () => {
    const ordered = pendingOrderRef.current
    if (!ordered) { setReorderStatus('idle'); return }

    reorderAbortRef.current?.abort()
    reorderAbortRef.current = new AbortController()

    const signal        = reorderAbortRef.current.signal
    const currentUserId = userIdRef.current
    const currentListId = listIdRef.current
    if (!currentListId) { setReorderStatus('idle'); return }

    try {
      const results = await Promise.all(
        ordered.map((task, i) =>
          apiFetch('/api/tasks', {
            method:  'PATCH',
            signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId: task.id, userId: currentUserId, position: i }),
          })
        )
      )

      if (results.some(r => !r.ok)) {
        throw new Error('partial reorder failure')
      }

      pendingOrderRef.current  = null
      originalOrderRef.current = null
      decrementPending(false)

    } catch (err: unknown) {
      decrementPending(false)

      // AbortError — пользователь ушёл назад во время сохранения, toast не нужен
      if (err instanceof Error && err.name === 'AbortError') return

      console.error('[flushReorderSave] error:', err)
      toast.error(t('reorderFailed'))

      // Откат к оригинальному порядку
      if (originalOrderRef.current) {
        reorderTasks(currentListId, originalOrderRef.current)
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
  }, [decrementPending, reorderTasks, t, navigateBack])

  // ── DnD handlers ─────────────────────────────────────────────────────────

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = String(event.active.id)
    // Замораживаем порядок в момент начала drag
    frozenSortedRef.current = sortedRef.current
    isDraggingRef.current   = true
    setDraggingId(id)
    haptic.light()
  }, [haptic])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    isDraggingRef.current = false
    setDraggingId(null)
    if (!over || active.id === over.id) return

    haptic.medium()

    const frozen   = frozenSortedRef.current
    const oldIndex = frozen.findIndex(task => task.id === active.id)
    const newIndex = frozen.findIndex(task => task.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const newOrder = arrayMove(frozen, oldIndex, newIndex)
    if (!originalOrderRef.current) originalOrderRef.current = frozen
    pendingOrderRef.current = newOrder

    // rAF чтобы не конкурировать с dnd-kit cleanup
    requestAnimationFrame(() => {
      reorderTasks(listIdRef.current!, [...newOrder, ...archivedTasks])
    })

    setReorderStatus('pending')
    clearTimeout(reorderDebounceRef.current)
    reorderDebounceRef.current = setTimeout(() => {
      setReorderStatus('saving')
      incrementPending()
      void flushReorderSave()
    }, 1)
  }, [haptic, archivedTasks, incrementPending, reorderTasks, flushReorderSave])

  const handleDragCancel = useCallback(() => {
    isDraggingRef.current = false
    setDraggingId(null)
  }, [])

  // ── handleBack ────────────────────────────────────────────────────────────
  const handleBack = useCallback(() => {
    if (reorderStatus !== 'idle' || pendingOrderRef.current) {
      wantsToGoBackRef.current = true
      if (reorderStatus === 'pending') {
        clearTimeout(reorderDebounceRef.current)
        setReorderStatus('saving')
        void flushReorderSave()
      }
      return
    }
    navigateBack()
  }, [reorderStatus, navigateBack, flushReorderSave])

  // ────────────────────────────────────────────────────────────────────────
  //  Task open handlers — стабильные useCallback, НЕ создаются в map
  //
  //  Было: onOpen={(t) => { setViewerTask(t); ... }} внутри displayList.map()
  //  → новая функция на каждый элемент при каждом рендере → memo TaskCard ломается
  //
  //  Стало: два стабильных обработчика, onOpen = один из них (по isViewer)
  //  → ссылка меняется только при смене myRole, memo работает корректно
  // ────────────────────────────────────────────────────────────────────────

  /** Открытие задачи для viewer (read-only sheet) */
  const handleOpenAsViewer = useCallback((openedTask: Task) => {
    setViewerTask(openedTask)
    setViewedTaskIds(prev => new Set([...prev, openedTask.id]))
  }, [])

  /** Открытие задачи для editor/owner (редактируемый sheet) */
  const handleOpenAsEditor = useCallback((openedTask: Task) => {
    setActiveTask(openedTask)
    setViewedTaskIds(prev => new Set([...prev, openedTask.id]))
    // fire-and-forget, не ждём ответа
    apiFetch('/api/tasks/views', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: openedTask.id }),
    }).catch(err => console.warn('[handleOpenAsEditor] views POST failed:', err))
  }, [])

  // ── Task mutation handlers ────────────────────────────────────────────────

  const handleStatusToggle = useCallback(async (task: Task) => {
    if (isViewer || isPending) return
    const next: TaskStatus = task.status === 'done' ? 'todo' : 'done'
    updateTask(task.id, { status: next }, task.list_id)
    if (next === 'done') haptic.success(); else haptic.medium()

    const ok = await run(() =>
      apiFetch('/api/tasks', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id, userId: userIdRef.current, status: next }),
      }).then(r => { if (!r.ok) throw new Error('status update failed'); return r })
    )

    if (!ok) {
      updateTask(task.id, { status: next }, task.list_id)
      toast.error(t('failedStatus'))
      return
    }

    // Проверяем confetti — все активные задачи выполнены?
    // const current = tasks[listIdRef.current!] ?? []
    const current = useTaskStore.getState().tasks[listIdRef.current!] ?? []
    const allDone = current
      .filter(taskItem => !taskItem.archived)
      .every(taskItem => (taskItem.id === task.id ? next === 'done' : taskItem.status === 'done'))

    if (allDone && current.filter(taskItem => !taskItem.archived).length > 0) {
      setShowConfetti(true)
      haptic.success()
    }
  }, [isViewer, isPending, updateTask, haptic, run, t])

  const handleArchive = useCallback(async (task: Task) => {
    if (isPending) return
    updateTask(task.id, { archived: true }, task.list_id)
    haptic.medium()
    const ok = await run(() =>
      apiFetch('/api/tasks', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id, userId: userIdRef.current, archived: true }),
      }).then(r => { if (!r.ok) throw new Error('archive failed'); return r })
    )
    if (!ok) {
      updateTask(task.id, { archived: false }, task.list_id)
      toast.error(t('failedToArchive'))
    } else {
      toast.success(t('archived'))
    }
  }, [isPending, updateTask, haptic, run, t])

  const handleUnarchive = useCallback(async (task: Task) => {
    if (isPending) return
    updateTask(task.id, { archived: false }, task.list_id)
    haptic.medium()
    const ok = await run(() =>
      apiFetch('/api/tasks', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id, userId: userIdRef.current, archived: false }),
      }).then(r => { if (!r.ok) throw new Error('unarchive failed'); return r })
    )
    if (!ok) {
      updateTask(task.id, { archived: true }, task.list_id)
      toast.error(t('failedToRestore'))
    } else {
      toast.success(t('restored'))
    }
  }, [isPending, updateTask, haptic, run, t])

  const handleDelete = useCallback(async (task: Task) => {
    if (isPending) return
    removeTask(task.id, task.list_id)
    haptic.heavy()
    const ok = await run(() =>
      apiFetch(`/api/tasks?taskId=${task.id}&userId=${userIdRef.current}`, { method: 'DELETE' })
        .then(r => { if (!r.ok) throw new Error('delete failed'); return r })
    )
    if (!ok) {
      fetchTasks(false)
      toast.error(t('failedToDelete'))
    } else {
      toast(t('taskDeleted'), {
        action: { label: t('cancel'), onClick: () => fetchTasks(false) },
        duration: 4000,
      })
    }
  }, [isPending, removeTask, haptic, run, t, fetchTasks])

  const handleLongPress = useCallback((task: Task, x: number, y: number) => {
    setContextMenu({ task, x, y })
    haptic.medium()
  }, [haptic])

  const getContextItems = useCallback((task: Task): ContextMenuItem[] => {
    if (isViewer) {
      return [{ label: t('viewTask'), icon: '👁', onClick: () => setViewerTask(task) }]
    }
    return [
      { label: t('edit'), icon: '✏️', onClick: () => setActiveTask(task) },
      task.status !== 'done'
        ? { label: t('markAsDone'), icon: '✅', onClick: () => handleStatusToggle(task) }
        : { label: t('markAsTodo'), icon: '⬜', onClick: () => handleStatusToggle(task) },
      task.archived
        ? { label: t('restored'), icon: '📤', onClick: () => handleUnarchive(task) }
        : { label: t('archived'), icon: '📦', onClick: () => handleArchive(task) },
      { label: t('delete'), icon: '🗑️', color: 'text-danger', onClick: () => handleDelete(task) },
    ]
  }, [isViewer, t, handleStatusToggle, handleArchive, handleUnarchive, handleDelete])

  // ── Pull-to-refresh ───────────────────────────────────────────────────────

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (isDraggingRef.current) return
    pullStartY.current = e.touches[0].clientY
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (isDraggingRef.current) return
    if (!listRef.current || listRef.current.scrollTop > 0) return
    if (e.touches[0].clientY - pullStartY.current < 40) return
    setIsPulling(true)
  }, [])

  const onTouchEnd = useCallback(async () => {
    if (isDraggingRef.current || !isPulling) return
    setIsPulling(false)
    haptic.light()
    await fetchTasks()
    toast.success(t('refreshed'))
  }, [isPulling, haptic, t, fetchTasks])

  // ── Effects ───────────────────────────────────────────────────────────────

  // pendingTaskId: auto-open после навигации из глобального поиска
  useEffect(() => {
    if (!pendingTaskId || loading) return
    const target = allTasks.find(task => task.id === pendingTaskId)
    setPendingTaskId(null)
    if (!target) return
    if (isViewer) { setViewerTask(target) } else { setActiveTask(target) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTaskId, loading, allTasks])

  // Сброс при смене списка
  useEffect(() => {
    setLoading(true)
    setFilter('all')
    setSortKey('position')
    setSearchQuery('')
    localStorage.removeItem(`taskflow_search_${activeListId}`)
    setShowSearch(false)
    setShowSort(false)
    setContextMenu(null)
    wasDone.current = false
    clearTimeout(reorderDebounceRef.current)
    pendingOrderRef.current  = null
    originalOrderRef.current = null
    setReorderStatus('idle')
    wantsToGoBackRef.current = false
  }, [activeListId])

  // Роль пользователя в списке
  useEffect(() => {
    if (!activeListId || !user) return
    apiFetch(`/api/lists/share?listId=${activeListId}&userId=${user.id}`)
      .then(r => r.json())
      .then(d => { if (d.myRole) setMyRole(d.myRole) })
      .catch(err => console.warn('[role fetch]', err))
  }, [activeListId, user])

  // Entrance animation
  useEffect(() => {
    gsap.fromTo(
      pageRef.current,
      { x: 40, opacity: 0 },
      { x: 0, opacity: 1, duration: 0.32, ease: 'power3.out' },
    )
  }, [])

  // Online / offline
  useEffect(() => {
    const goOnline  = () => { setIsOnline(true); fetchTasks(false) }
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online',  goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online',  goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [fetchTasks])



  const fetchTasksRef = useRef(fetchTasks)
  useEffect(() => { fetchTasksRef.current = fetchTasks }, [fetchTasks])

  // Realtime subscription + начальная загрузка
  useEffect(() => {
    if (!activeListId || !user) return
    listIdRef.current = activeListId
    userIdRef.current = user.id
    //fetchTasks()
    fetchTasksRef.current()

    const debFetch = () => {
      clearTimeout(fetchDebounceRef.current)
      fetchDebounceRef.current = setTimeout(() => fetchTasksRef.current(false), 300)
    }

    const channel = supabase
      .channel(`tasks-${activeListId}`)
      .on('postgres_changes' as any, {
        event: '*', schema: 'public', table: 'tasks',
        filter: `list_id=eq.${activeListId}`,
      }, debFetch)
      .on('postgres_changes' as any, {
        event: '*', schema: 'public', table: 'subtasks',
      }, debFetch)
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') setIsOnline(true)
      })

    return () => {
      supabase.removeChannel(channel)
      clearTimeout(fetchDebounceRef.current)
      abortRef.current?.abort()
    }
  }, [activeListId, user])


  useEffect(() => {
    const goOnline  = () => { clearTimeout(onlineDebounceRef.current); setIsOnline(true); fetchTasksRef.current(false) }
    const goOffline = () => { clearTimeout(onlineDebounceRef.current); onlineDebounceRef.current = setTimeout(() => setIsOnline(false), 3000) }
    window.addEventListener('online',  goOnline)
    window.addEventListener('offline', goOffline)
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline) }
  }, [])

  const stableBack = useRef(() => handleBackRef.current())
  const handleBackRef = useRef(handleBack)
  useEffect(() => { handleBackRef.current = handleBack }, [handleBack])
  // Telegram Back / Main buttons
  useEffect(() => {
    const tg = window?.Telegram?.WebApp
    if (!tg) return

    const onMain = () => { setShowCreate(true); haptic.light() }
    const onBack  = () => handleBackRef.current()

    if (!isViewer) {
      tg.MainButton.setText(t('newTaskBtn'))
      tg.MainButton.show()
      tg.MainButton.onClick(onMain)
    } else {
      tg.MainButton.hide()
    }

    tg.BackButton.show()
    // tg.BackButton.onClick(handleBack)
    tg.BackButton.onClick(stableBack.current)

    return () => {
      tg.MainButton.hide()
      tg.MainButton.offClick(onMain)
      tg.BackButton.hide()
      // tg.BackButton.offClick(handleBack)
      tg.BackButton.offClick(stableBack.current)
    }
  }, [isViewer, haptic, t])

  // ── Guard ─────────────────────────────────────────────────────────────────
  if (!list) return null

  // ── Stable onOpen — выбираем из двух стабильных обработчиков ─────────────
  // Это НЕ создаёт новую функцию в map — isViewer меняется редко
  const onOpen = isViewer ? handleOpenAsViewer : handleOpenAsEditor

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div ref={pageRef} className="page-container">
      <style>{TASK_ANIM_STYLE}</style>

      {showConfetti && <Confetti onDone={() => setShowConfetti(false)} />}
      <SaveBanner />

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-2 flex-shrink-0">
        <div className="flex items-center gap-2 mb-2">

          <button onClick={handleBack} className="btn-ghost p-2 -ml-2" aria-label="Back">
            <ArrowLeft size={20} />
          </button>

          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
            style={{ background: `${list.color}20` }}
          >
            {list.emoji}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h1 className="font-bold text-base truncate">{list.title}</h1>
              <div className={cn(
                'w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors',
                isOnline ? 'bg-emerald' : 'bg-danger animate-pulse',
              )} />
              {isViewer && (
                <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-text-dim/20 text-text-secondary flex-shrink-0">
                  <Eye size={9} /> {t('viewOnly')}
                </span>
              )}
            </div>
            {totalCount > 0 && (
              <p className="text-xs text-text-secondary">
                {doneCount}/{totalCount} {t('subtasksDone')}
              </p>
            )}
          </div>

          <button onClick={toggleTheme} className="btn-ghost p-2" aria-label="Toggle theme">
            {theme === 'dark'
              ? <Sun  size={17} className="text-amber" />
              : <Moon size={17} />
            }
          </button>

          <button
            onClick={() => {
              setShowSearch(!showSearch)
              if (!showSearch) setTimeout(() => searchRef.current?.focus(), 100)
            }}
            className={cn('btn-ghost p-2', showSearch && 'text-accent bg-accent/10')}
            aria-label="Search"
          >
            <Search size={17} />
          </button>

          <button
            onClick={() => setShowSort(!showSort)}
            className={cn('btn-ghost p-2', sortKey !== 'position' && 'text-accent bg-accent/10')}
            aria-label="Sort"
          >
            <SortAsc size={17} />
          </button>
        </div>

        {showSearch && (
          <div className="relative mb-2 animate-fade-up">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
            <input
              ref={searchRef}
              value={searchQuery}
              // onChange={e => setSearchQuery(e.target.value)}
              onChange={e => {
                setSearchQuery(e.target.value)
                if (e.target.value) localStorage.setItem(SEARCH_KEY, e.target.value)
                else localStorage.removeItem(SEARCH_KEY)
              }}
              placeholder={t('searchPlaceholder')}
              className="input-field pl-9 pr-9 py-2.5 text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim"
                aria-label="Clear search"
              >
                <X size={15} />
              </button>
            )}
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
              <button
                key={s.key}
                onClick={() => { setSortKey(s.key); haptic.select() }}
                style={sortKey === s.key
                  ? { background: 'var(--c-accent)', color: '#fff', borderRadius: 8 }
                  : {
                      background:  'rgba(255,255,255,0.05)',
                      border:      '0.5px solid rgba(255,255,255,0.08)',
                      color:       'var(--text-secondary)',
                      borderRadius: 8,
                    }
                }
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {totalCount > 0 && filter !== 'archived' && (
          <div className="h-1 bg-bg-card rounded-full overflow-hidden mb-2.5">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width:      `${progress}%`,
                background: progress === 100
                  ? 'linear-gradient(90deg,#3ECF8E,#22B97A)'
                  : `linear-gradient(90deg,${list.color},${list.color}cc)`,
              }}
            />
          </div>
        )}

        <div className="flex gap-1 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
          {STATUS_TABS.map(tab => {
            const count =
              tab.key === 'all'        ? activeTasks.length
              : tab.key === 'archived' ? archivedTasks.length
              : activeTasks.filter(task => task.status === tab.key).length

            return (
              <button
                key={tab.key}
                onClick={() => { setFilter(tab.key); haptic.select() }}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all',
                  filter === tab.key
                    ? 'bg-accent text-white shadow-glow-sm'
                    : 'text-text-secondary hover:bg-bg-hover',
                )}
              >
                {tab.label}
                {count > 0 && (
                  <span
                    className="ml-1.5 text-[11px] tabular-nums"
                    style={filter === tab.key
                      ? { color: 'rgba(255,255,255,0.75)' }
                      : { color: 'var(--text-dim)' }
                    }
                  >
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {!isOnline && (
          <div className="flex items-center justify-between gap-2 bg-danger/10 border border-danger/20 rounded-xl px-3 py-2 mt-2 animate-fade-up">
            <div className="flex items-center gap-2 text-xs text-danger font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-danger animate-pulse flex-shrink-0" />
              {t('noConnection')}
            </div>
            <button
              onClick={() => fetchTasks()}
              className="text-xs text-danger underline"
            >
              {t('retry')}
            </button>
          </div>
        )}

        {isPulling && (
          <div className="flex items-center justify-center py-2 text-xs text-accent gap-1.5 animate-fade-up">
            <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            {t('releaseToRefresh')}
          </div>
        )}
      </div>

      {/* ── Task list ────────────────────────────────────────────────────── */}
      <div className="flex-1 relative min-h-0">
        {/* Blocking overlay во время сохранения reorder */}
        {isBlocked && (
          <div className="absolute inset-0 z-20 bg-bg-base/30 backdrop-blur-[1px] pointer-events-auto" />
        )}

        <div
          ref={listRef}
          className="h-full scrollable px-4 pb-24"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {/* Loading skeleton */}
          {loading ? (
            <div className="space-y-2 mt-2">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="h-16 skeleton rounded-2xl"
                  style={{ animationDelay: `${i * 80}ms` }}
                />
              ))}
            </div>

          /* Empty state */
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center animate-fade-up">
              <p className="text-text-dim text-sm">
                {searchQuery
                  ? t('noTasksMatch')
                  : filter === 'archived'
                    ? t('nothingArchived')
                    : t('noTasksHere')
                }
              </p>
              {!searchQuery && filter !== 'archived' && !isViewer && (
                <button
                  onClick={() => setShowCreate(true)}
                  className="mt-3 text-accent text-sm font-medium"
                >
                  {t('addOne')}
                </button>
              )}
            </div>

          /* Task cards */
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={pointerWithin}
              measuring={{ droppable: { strategy: MeasuringStrategy.WhileDragging } }}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
            <SortableContext items={sortedIds} strategy={verticalListSortingStrategy}>
              <div className={cn('mt-2', tasksAnimClass && 'tasks-animate')}>
                {/* <VirtualList
                  items={displayList}
                  getKey={task => task.id}
                  eager={6}
                  minHeight={72}
                  gap="space-y-2"
                >
                  {(task) => (
                    <SwipeableTaskCard
                      onSwipeRight={() => {
                        if (task.status !== 'done') handleStatusToggle(task)
                      }}
                      onSwipeLeft={() => {
                        if (!task.archived) handleArchive(task)
                      }}
                      disabled={isDragMode && !!draggingId}
                      isDraggingGlobal={!!draggingId}
                      onSwipeStart={() => { isSwipingRef.current = true }}
                      onSwipeEnd={() => {
                        setTimeout(() => { isSwipingRef.current = false }, 50)
                      }}
                    >
                      <SortableTaskCard
                        task={task}
                        isUnread={!viewedTaskIds.has(task.id)}
                        userId={user?.id ?? 0}
                        isViewer={isViewer}
                        isDragMode={isDragMode}
                        isDragging={draggingId === task.id}
                        onToggle={handleStatusToggle}
                        onOpen={onOpen}
                        onLongPress={(x, y) => handleLongPress(task, x, y)}
                        isSwiping={isSwipingRef}
                      />
                    </SwipeableTaskCard>
                  )}
                </VirtualList> */}
                <VirtualList
                  items={displayList}
                  getKey={task => task.id}
                  eager={6}
                  minHeight={72}
                  gap="space-y-2"
                >
                  {(task) => (
                    <TaskRow
                      task={task}
                      userId={user?.id ?? 0}
                      isViewer={isViewer}
                      isDragMode={isDragMode}
                      draggingId={draggingId}
                      viewedTaskIds={viewedTaskIds}
                      isSwipingRef={isSwipingRef}
                      onSwipeRight={handleStatusToggle}
                      onSwipeLeft={handleArchive}
                      onSwipeLeftDeep={!isViewer ? handleDelete : undefined}
                      onToggle={handleStatusToggle}
                      onOpen={onOpen}
                      onLongPress={handleLongPress}
                    />
                  )}
                </VirtualList>
              </div>
            </SortableContext>

              {/* DragOverlay — рендерится поверх всего во время drag */}
              <DragOverlay
                dropAnimation={{
                  duration: 180,
                  easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
                }}
              >
                {draggingTask ? (
                  <div className="rotate-[0.8deg] scale-[1.03] shadow-2xl opacity-95">
                    <TaskCard
                      task={draggingTask}
                      userId={user?.id ?? 0}
                      isViewer={false}
                      isDragMode={false}
                      isDraggingOverlay
                      onToggle={() => {}}
                      onOpen={() => {}}
                      onLongPress={() => {}}
                    />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      </div>

      {/* ── FAB ─────────────────────────────────────────────────────────── */}
      {!isViewer && !window?.Telegram?.WebApp?.initData
      && (
        <button
          onClick={() => { if (isBlocked) return; setShowCreate(true); haptic.light() }}
          disabled={isBlocked}
          className={cn(
            'fixed bottom-6 right-4 w-14 h-14 rounded-2xl bg-accent text-white',
            'flex items-center justify-center shadow-glow z-40',
            'active:scale-90 transition-all duration-150',
            isBlocked && 'opacity-40 cursor-not-allowed',
          )}
          aria-label="Add task"
        >
          {isBlocked
            ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : <Plus size={24} strokeWidth={2.5} />
          }
        </button>
      )}

      {/* ── Overlays ─────────────────────────────────────────────────────── */}

      {contextMenu && (
        <ContextMenu
          items={getContextItems(contextMenu.task)}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}

      {viewerTask && (
        <ViewerTaskSheet
          task={viewerTask}
          userId={user?.id ?? 0}
          onClose={() => setViewerTask(null)}
          onSubtaskToggled={() => fetchTasks(false)}
        />
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