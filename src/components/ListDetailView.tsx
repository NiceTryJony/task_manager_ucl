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
import { PRIORITY_CONFIG, formatDueDate, cn } from '@/lib/utils'
import {
  ArrowLeft, Plus, Share2, Download, GripVertical,
  Trash2, Calendar, CheckCircle2,
} from 'lucide-react'
import { TaskSheet } from '@/components/TaskSheet'
import { ShareSheet } from '@/components/ShareSheet'
import type { Task, TaskStatus } from '@/types'
import { toast } from 'sonner'

interface Props { onBack: () => void }

const STATUS_TABS: { key: TaskStatus | 'all'; label: string }[] = [
  { key: 'all',         label: 'All'     },
  { key: 'todo',        label: 'To Do'   },
  { key: 'in_progress', label: 'Doing'   },
  { key: 'done',        label: 'Done'    },
]

export function ListDetailView({ onBack }: Props) {
  const { user, haptic } = useTelegram()
  const { lists, tasks, activeListId, setTasks, updateTask, removeTask, reorderTasks } = useTaskStore()
  const list = lists.find(l => l.id === activeListId)

  const [filter,     setFilter]    = useState<TaskStatus | 'all'>('all')
  const [loading,    setLoading]   = useState(true)
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showShare,  setShowShare]  = useState(false)
  const pageRef   = useRef<HTMLDivElement>(null)
  const listRef   = useRef<HTMLDivElement>(null)

  const allTasks = tasks[activeListId!] ?? []
  const filtered = filter === 'all' ? allTasks : allTasks.filter(t => t.status === filter)
  const doneCount = allTasks.filter(t => t.status === 'done').length

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  // Page entrance animation
  useEffect(() => {
    if (pageRef.current) {
      gsap.fromTo(pageRef.current,
        { x: 40, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.32, ease: 'power3.out' }
      )
    }
  }, [])

  useEffect(() => {
    if (!activeListId || !user) return
    fetchTasks()

    const channel = supabase
      .channel(`tasks-${activeListId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `list_id=eq.${activeListId}` }, fetchTasks)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subtasks' }, fetchTasks)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [activeListId, user])

  async function fetchTasks() {
    const res  = await fetch(`/api/tasks?listId=${activeListId}&userId=${user!.id}`)
    const data = await res.json()
    setTasks(activeListId!, data.tasks ?? [])
    setLoading(false)

    requestAnimationFrame(() => {
      const cards = listRef.current?.querySelectorAll('.task-item')
      if (cards?.length) {
        gsap.fromTo(cards,
          { x: -16, opacity: 0 },
          { x: 0, opacity: 1, duration: 0.28, stagger: 0.045, ease: 'power2.out' }
        )
      }
    })
  }

  function handleBack() {
    haptic.light()
    gsap.to(pageRef.current, {
      x: 40, opacity: 0, duration: 0.22, ease: 'power2.in',
      onComplete: onBack,
    })
  }

  async function handleStatusToggle(task: Task) {
    const next: TaskStatus = task.status === 'done' ? 'todo' : 'done'
    updateTask(task.id, { status: next })

    if (next === 'done') {
      haptic.success()
      // Completion ripple on the card
      const card = document.getElementById(`task-${task.id}`)
      if (card) {
        gsap.fromTo(card,
          { scale: 1 },
          { scale: 1.025, duration: 0.12, yoyo: true, repeat: 1, ease: 'power2.out' }
        )
      }
    } else {
      haptic.medium()
    }

    await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: task.id, userId: user!.id, status: next }),
    })
  }

  async function handleDelete(task: Task) {
    const confirmed = await new Promise<boolean>(resolve => {
      window?.Telegram?.WebApp?.showConfirm
        ? window.Telegram.WebApp.showConfirm('Delete this task?', resolve)
        : resolve(window.confirm('Delete this task?'))
    })
    if (!confirmed) return

    // Animate out
    const card = document.getElementById(`task-${task.id}`)
    if (card) {
      await gsap.to(card, { x: 40, opacity: 0, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0, duration: 0.25, ease: 'power2.in' })
    }

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
    await Promise.all(reordered.map((t, i) =>
      fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: t.id, userId: user!.id, position: i }),
      })
    ))
  }

  async function handleExport() {
    haptic.light()
    const res  = await fetch(`/api/export?listId=${activeListId}&userId=${user!.id}`)
    const text = await res.text()
    if (navigator.share) {
      await navigator.share({ title: list?.title, text })
    } else {
      await navigator.clipboard.writeText(text)
      toast.success('Copied to clipboard!')
    }
  }

  if (!list) return null

  const progress = allTasks.length ? Math.round((doneCount / allTasks.length) * 100) : 0

  return (
    <div ref={pageRef} className="page-container">
      {/* Header */}
      <div className="px-4 pt-3 pb-2 flex-shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <button onClick={handleBack} className="btn-ghost p-2 -ml-2">
            <ArrowLeft size={20} />
          </button>
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
            style={{ background: `${list.color}20` }}
          >
            {list.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-base leading-tight truncate">{list.title}</h1>
            {allTasks.length > 0 && (
              <p className="text-xs text-text-secondary">{doneCount}/{allTasks.length} done</p>
            )}
          </div>
          <button onClick={handleExport} className="btn-ghost p-2" title="Export">
            <Download size={17} />
          </button>
          <button onClick={() => { setShowShare(true); haptic.light() }} className="btn-ghost p-2">
            <Share2 size={17} />
          </button>
          <button
            onClick={() => { setShowCreate(true); haptic.light() }}
            className="btn-primary flex items-center gap-1 px-3 py-2 text-sm"
          >
            <Plus size={15} strokeWidth={2.5} />
            Add
          </button>
        </div>

        {/* Progress bar */}
        {allTasks.length > 0 && (
          <div className="h-1 bg-bg-card rounded-full overflow-hidden mb-3">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${progress}%`,
                background: progress === 100
                  ? 'linear-gradient(90deg, #34D399, #10B981)'
                  : `linear-gradient(90deg, ${list.color}, ${list.color}cc)`,
              }}
            />
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-1 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
          {STATUS_TABS.map(tab => {
            const count = tab.key === 'all' ? allTasks.length : allTasks.filter(t => t.status === tab.key).length
            return (
              <button
                key={tab.key}
                onClick={() => { setFilter(tab.key); haptic.select() }}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-200',
                  filter === tab.key
                    ? 'bg-accent text-white shadow-glow-sm'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
                )}
              >
                {tab.label}
                {count > 0 && (
                  <span className={cn('ml-1.5 text-xs', filter === tab.key ? 'opacity-80' : 'opacity-50')}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tasks */}
      <div ref={listRef} className="flex-1 scrollable px-4 pb-4">
        {loading ? (
          <div className="space-y-2 mt-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 skeleton rounded-2xl" style={{ animationDelay: `${i * 80}ms` }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center animate-fade-up">
            <p className="text-text-dim text-sm">No tasks here</p>
            <button onClick={() => setShowCreate(true)} className="mt-3 text-accent text-sm font-medium">
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

// ── Sortable Task Card ─────────────────────────────────────────
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
    transition: transition ?? 'transform 200ms cubic-bezier(0.25, 1, 0.5, 1)',
    opacity: isDragging ? 0.45 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  const priority      = PRIORITY_CONFIG[task.priority]
  const dueInfo       = task.due_date ? formatDueDate(task.due_date) : null
  const isDone        = task.status === 'done'
  const subtasksDone  = task.subtasks?.filter(s => s.completed).length ?? 0
  const subtasksTotal = task.subtasks?.length ?? 0

  return (
    <div ref={setNodeRef} style={style} id={`task-${task.id}`} className="task-item">
      <div className={cn(
        'card p-3.5 flex items-start gap-2.5',
        isDone ? 'opacity-55' : 'hover:bg-bg-hover',
        isDragging && 'shadow-glow'
      )}>
        {/* Drag */}
        <button {...attributes} {...listeners} className="text-text-dim mt-0.5 flex-shrink-0 touch-none cursor-grab active:cursor-grabbing">
          <GripVertical size={15} />
        </button>

        {/* Checkbox */}
        <button onClick={onToggle} className={cn('custom-checkbox mt-0.5', isDone ? 'checked' : 'unchecked')}>
          {isDone && (
            <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
              <path d="M1 4L4 7L10 1" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                style={{ strokeDasharray: 20, strokeDashoffset: 0, animation: 'checkmark-draw 0.25s ease forwards' }}
              />
            </svg>
          )}
        </button>

        {/* Content */}
        <button onClick={onOpen} className="flex-1 min-w-0 text-left">
          <p className={cn('text-sm font-medium leading-snug', isDone && 'line-through text-text-secondary')}>
            {task.title}
          </p>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', priority.color, priority.bg)}>
              {priority.label}
            </span>
            {dueInfo && (
              <span className={cn('text-xs flex items-center gap-1',
                dueInfo.overdue ? 'text-danger' : dueInfo.urgent ? 'text-amber' : 'text-text-secondary'
              )}>
                <Calendar size={11} />
                {dueInfo.label}
              </span>
            )}
            {subtasksTotal > 0 && (
              <span className="text-xs text-text-secondary flex items-center gap-1">
                <CheckCircle2 size={11} />
                {subtasksDone}/{subtasksTotal}
              </span>
            )}
          </div>
        </button>

        {/* Delete */}
        <button onClick={onDelete} className="text-text-dim hover:text-danger transition-colors duration-150 mt-0.5 p-0.5">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}
