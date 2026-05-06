'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { gsap } from 'gsap'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '@/lib/supabase'
import { useTaskStore } from '@/lib/store'
import { useTelegram } from '@/hooks/useTelegram'
import { PRIORITY_CONFIG, STATUS_CONFIG, formatDueDate, cn } from '@/lib/utils'
import {
  ArrowLeft, Plus, Share2, Download, Filter,
  ChevronDown, CheckCircle2, Circle, GripVertical,
  ChevronRight, Trash2, Calendar, Flag,
} from 'lucide-react'
import { TaskSheet } from '@/components/TaskSheet'
import { ShareSheet } from '@/components/ShareSheet'
import type { Task, TaskStatus } from '@/types'
import { toast } from 'sonner'

interface Props { onBack: () => void }

const STATUS_TABS: { key: TaskStatus | 'all'; label: string }[] = [
  { key: 'all',        label: 'All' },
  { key: 'todo',       label: 'To Do' },
  { key: 'in_progress', label: 'Doing' },
  { key: 'done',       label: 'Done' },
]

export function ListDetailView({ onBack }: Props) {
  const { user, haptic } = useTelegram()
  const { lists, tasks, activeListId, setTasks, updateTask, removeTask, reorderTasks } = useTaskStore()
  const list = lists.find(l => l.id === activeListId)

  const [filter,      setFilter]    = useState<TaskStatus | 'all'>('all')
  const [loading,     setLoading]   = useState(true)
  const [activeTask,  setActiveTask] = useState<Task | null>(null)
  const [showCreate,  setShowCreate] = useState(false)
  const [showShare,   setShowShare]  = useState(false)
  const headerRef = useRef<HTMLDivElement>(null)
  const listRef   = useRef<HTMLDivElement>(null)

  const allTasks = tasks[activeListId!] ?? []
  const filtered = filter === 'all' ? allTasks : allTasks.filter(t => t.status === filter)

  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  }))

  // Fetch tasks
  useEffect(() => {
    if (!activeListId || !user) return
    fetchTasks()

    // Realtime subscription
    const channel = supabase
      .channel(`tasks-${activeListId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'tasks',
        filter: `list_id=eq.${activeListId}`,
      }, () => fetchTasks())
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'subtasks',
      }, () => fetchTasks())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [activeListId, user])

  async function fetchTasks() {
    const res  = await fetch(`/api/tasks?listId=${activeListId}&userId=${user!.id}`)
    const data = await res.json()
    setTasks(activeListId!, data.tasks ?? [])
    setLoading(false)
    // Animate
    requestAnimationFrame(() => {
      const cards = listRef.current?.querySelectorAll('.task-card')
      if (cards?.length) {
        gsap.fromTo(cards,
          { x: -16, opacity: 0 },
          { x: 0, opacity: 1, duration: 0.3, stagger: 0.05, ease: 'power2.out' }
        )
      }
    })
  }

  async function handleStatusToggle(task: Task) {
    const next: TaskStatus = task.status === 'done' ? 'todo' : 'done'
    // Optimistic update
    updateTask(task.id, { status: next })
    haptic.medium()

    if (next === 'done') {
      // Completion animation
      haptic.success()
    }

    await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: task.id, userId: user!.id, status: next }),
    })
  }

  async function handleDelete(task: Task) {
    const ok = await new Promise<boolean>(resolve => {
      window?.Telegram?.WebApp?.showConfirm
        ? window.Telegram.WebApp.showConfirm('Delete this task?', resolve)
        : resolve(window.confirm('Delete this task?'))
    })
    if (!ok) return

    removeTask(task.id, task.list_id)
    haptic.heavy()

    await fetch(`/api/tasks?taskId=${task.id}&userId=${user!.id}`, { method: 'DELETE' })
    toast.success('Task deleted')
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = allTasks.findIndex(t => t.id === active.id)
    const newIndex = allTasks.findIndex(t => t.id === over.id)
    const reordered = arrayMove(allTasks, oldIndex, newIndex)
    reorderTasks(activeListId!, reordered)
    haptic.select()

    // Persist positions
    await Promise.all(
      reordered.map((t, i) =>
        fetch('/api/tasks', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: t.id, userId: user!.id, position: i }),
        })
      )
    )
  }

  async function handleExport() {
    haptic.light()
    const url = `/api/export?listId=${activeListId}&userId=${user!.id}`
    const res = await fetch(url)
    const text = await res.text()

    // Copy to clipboard or share via Telegram
    if (navigator.share) {
      await navigator.share({ title: list?.title, text })
    } else {
      await navigator.clipboard.writeText(text)
      toast.success('Copied to clipboard!')
    }
  }

  if (!list) return null

  return (
    <div className="page-container">
      {/* Header */}
      <div ref={headerRef} className="px-4 pt-3 pb-2 flex-shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <button onClick={onBack} className="btn-ghost p-2 -ml-2">
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-2xl">{list.emoji}</span>
            <h1 className="font-bold text-lg truncate">{list.title}</h1>
          </div>
          <button onClick={handleExport} className="btn-ghost p-2" title="Export">
            <Download size={18} />
          </button>
          <button onClick={() => setShowShare(true)} className="btn-ghost p-2" title="Share">
            <Share2 size={18} />
          </button>
          <button
            onClick={() => { setShowCreate(true); haptic.light() }}
            className="btn-primary flex items-center gap-1 px-3 py-2 text-sm"
          >
            <Plus size={16} strokeWidth={2.5} />
            Add
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all',
                filter === tab.key
                  ? 'bg-accent text-white'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
              )}
            >
              {tab.label}
              {tab.key !== 'all' && (
                <span className="ml-1.5 text-xs opacity-70">
                  {allTasks.filter(t => t.status === tab.key).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Task list */}
      <div ref={listRef} className="flex-1 scrollable px-4 pb-4">
        {loading ? (
          <div className="space-y-2 mt-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 skeleton rounded-2xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <p className="text-text-dim text-sm">No tasks here</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-3 text-accent text-sm font-medium"
            >
              + Add one
            </button>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={filtered.map(t => t.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2 mt-2">
                {filtered.map(task => (
                  <SortableTaskCard
                    key={task.id}
                    task={task}
                    onToggle={() => handleStatusToggle(task)}
                    onOpen={() => setActiveTask(task)}
                    onDelete={() => handleDelete(task)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Modals */}
      {(showCreate || activeTask) && (
        <TaskSheet
          listId={activeListId!}
          userId={user!.id}
          task={activeTask ?? undefined}
          onClose={() => { setShowCreate(false); setActiveTask(null) }}
          onSaved={() => { setShowCreate(false); setActiveTask(null); fetchTasks() }}
        />
      )}

      {showShare && (
        <ShareSheet
          listId={activeListId!}
          userId={user!.id}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  )
}

// ─── Sortable Task Card ───────────────────────────────────────────
interface TaskCardProps {
  task: Task
  onToggle: () => void
  onOpen: () => void
  onDelete: () => void
}

function SortableTaskCard({ task, onToggle, onOpen, onDelete }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  const priority   = PRIORITY_CONFIG[task.priority]
  const dueInfo    = task.due_date ? formatDueDate(task.due_date) : null
  const isDone     = task.status === 'done'
  const subtasksDone = task.subtasks?.filter(s => s.completed).length ?? 0
  const subtasksTotal = task.subtasks?.length ?? 0

  return (
    <div ref={setNodeRef} style={style} className="task-card">
      <div className={cn(
        'card p-3.5 flex items-start gap-3 transition-colors',
        isDone && 'opacity-60',
        'hover:bg-bg-hover'
      )}>
        {/* Drag handle */}
        <button
          {...attributes} {...listeners}
          className="text-text-dim mt-0.5 flex-shrink-0 touch-none"
        >
          <GripVertical size={16} />
        </button>

        {/* Checkbox */}
        <button
          onClick={onToggle}
          className={cn('custom-checkbox mt-0.5', isDone ? 'checked' : 'unchecked')}
        >
          {isDone && (
            <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
              <path d="M1 4L4 7L10 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>

        {/* Content */}
        <button onClick={onOpen} className="flex-1 min-w-0 text-left">
          <p className={cn('text-sm font-medium leading-snug', isDone && 'line-through text-text-secondary')}>
            {task.title}
          </p>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
            {/* Priority */}
            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', priority.color, priority.bg)}>
              {priority.label}
            </span>

            {/* Due date */}
            {dueInfo && (
              <span className={cn(
                'text-xs flex items-center gap-1',
                dueInfo.overdue ? 'text-danger' : dueInfo.urgent ? 'text-amber' : 'text-text-secondary'
              )}>
                <Calendar size={11} />
                {dueInfo.label}
              </span>
            )}

            {/* Subtasks */}
            {subtasksTotal > 0 && (
              <span className="text-xs text-text-secondary">
                ☑ {subtasksDone}/{subtasksTotal}
              </span>
            )}
          </div>
        </button>

        {/* Delete */}
        <button onClick={onDelete} className="text-text-dim hover:text-danger transition-colors mt-0.5">
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  )
}
