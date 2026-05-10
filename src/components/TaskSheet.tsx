'use client'

import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import {
  X, Plus, Trash2, Clock, Calendar, AlignLeft, Flag,
  CheckSquare, GripVertical, User, Check,
} from 'lucide-react'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { PRIORITY_CONFIG, cn } from '@/lib/utils'
import type { Priority, Task } from '@/types'
import { TaskHistoryPanel } from '@/components/TaskHistoryPanel'
import { toast } from 'sonner'
import { usePending } from '@/hooks/usePending'
import { AssigneePicker } from '@/components/AssigneePicker'

interface Props {
  listId:  string
  userId:  number
  task?:   Task
  onClose: () => void
  onSaved: () => void
}

interface LocalSubtask {
  id?:       string
  title:     string
  completed: boolean
  creator?: {
    id:         number
    first_name: string
    username?:  string | null
  } | null
}

const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent']
const PRIORITY_ICONS: Record<Priority, string> = {
  low: '○', medium: '◑', high: '●', urgent: '⚠',
}

function getUserTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return 'UTC' }
}

function formatInTz(isoStr: string, tz: string) {
  try {
    return new Date(isoStr).toLocaleString('en-US', {
      timeZone: tz, month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return isoStr }
}

// ── Sortable subtask row ───────────────────────────────────────

interface SubtaskRowProps {
  sub:      LocalSubtask
  idx:      number
  userId:   number
  isEdit:   boolean          // true = task already saved in DB
  onToggle: () => void
  onRename: (newTitle: string) => void
  onDelete: () => void
}

function SortableSubtaskRow({ sub, idx, userId, isEdit, onToggle, onRename, onDelete }: SubtaskRowProps) {
  const nodeId = sub.id ?? `new-${idx}`

  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(sub.title)
  const inputRef              = useRef<HTMLInputElement>(null)

  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: nodeId })

  const style = {
    transform:  CSS.Transform.toString(transform),
    transition: transition ?? 'transform 150ms ease',
    opacity:    isDragging ? 0.5 : 1,
    zIndex:     isDragging ? 10 : undefined,
  }

  function startEdit() {
    if (sub.completed) return   // не редактируем выполненные
    setDraft(sub.title)
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 40)
  }

  function commitEdit() {
    const trimmed = draft.trim()
    setEditing(false)
    if (!trimmed || trimmed === sub.title) return
    onRename(trimmed)

    // Немедленно сохраняем в БД если сабтаск уже существует
    if (sub.id && isEdit) {
      fetch('/api/tasks/subtasks', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtaskId: sub.id, userId, title: trimmed }),
      }).catch(() => toast.error('Failed to rename subtask'))
    }
  }

  function cancelEdit() {
    setEditing(false)
    setDraft(sub.title)
  }

  return (
    <div ref={setNodeRef} style={style}>
      <div className={cn(
        'flex items-center gap-2.5 px-3 py-2.5 rounded-[14px] border transition-all duration-150',
        isDragging
          ? 'bg-bg-hover border-accent/30 shadow-[0_4px_16px_rgba(123,110,246,0.2)]'
          : 'bg-bg-card border-bg-border/60'
      )}>

        {/* Drag handle — крупнее для пальца */}
        <button
          {...attributes} {...listeners}
          className="text-text-dim flex-shrink-0 touch-none cursor-grab active:cursor-grabbing p-1 -ml-1 rounded-lg hover:bg-bg-hover transition-colors"
          tabIndex={-1}
        >
          <GripVertical size={15} />
        </button>

        {/* Checkbox */}
        <button
          onClick={onToggle}
          className={cn(
            'custom-checkbox flex-shrink-0 transition-all duration-200',
            sub.completed ? 'checked' : 'unchecked'
          )}
        >
          {sub.completed && (
            <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
              <path d="M1 4L4 7L10 1" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        {/* Title / inline editor */}
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex items-center gap-1.5">
              <input
                ref={inputRef}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={e => {
                  if (e.key === 'Enter')  { e.preventDefault(); commitEdit() }
                  if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
                }}
                className="flex-1 min-w-0 bg-transparent text-sm text-text-primary outline-none border-b border-accent/60 pb-0.5 leading-snug"
                maxLength={300}
              />
              <button
                onMouseDown={e => { e.preventDefault(); commitEdit() }}
                className="w-5 h-5 flex items-center justify-center rounded-md bg-accent/20 text-accent flex-shrink-0"
              >
                <Check size={11} strokeWidth={2.5} />
              </button>
            </div>
          ) : (
            <button
              onClick={startEdit}
              disabled={sub.completed}
              className={cn(
                'text-sm text-left w-full leading-snug truncate transition-colors',
                sub.completed
                  ? 'line-through text-text-dim cursor-default'
                  : 'text-text-primary hover:text-accent'
              )}
            >
              {sub.title}
            </button>
          )}

          {sub.creator && !editing && (
            <span className="text-[10px] text-text-dim flex items-center gap-1 mt-0.5">
              <User size={9} />
              {sub.creator.first_name}
              {sub.creator.username && ` · @${sub.creator.username}`}
            </span>
          )}
        </div>

        {/* Delete — всегда видна */}
        <button
          onClick={onDelete}
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-text-dim hover:text-danger hover:bg-danger/10 active:scale-90 transition-all duration-150"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────

export function TaskSheet({ listId, userId, task, onClose, onSaved }: Props) {
  const isEdit = !!task

  const [title,       setTitle]       = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [priority,    setPriority]    = useState<Priority>(task?.priority ?? 'medium')
  const [dueDate,     setDueDate]     = useState('')
  const [dueTime,     setDueTime]     = useState('')
  const [assignedTo,  setAssignedTo]  = useState<number | null>(task?.assigned_to ?? null)
  const [subtasks,    setSubtasks]    = useState<LocalSubtask[]>(
    task?.subtasks?.map(s => ({
      id:        s.id,
      title:     s.title,
      completed: s.completed,
      creator:   s.creator ?? null,
    })) ?? []
  )
  const [newSubtask,  setNewSubtask]  = useState('')
  const [saving,      setSaving]      = useState(false)
  const { run }                       = usePending()
  const [viewerTz]                    = useState(getUserTimezone)

  const sheetRef   = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const titleRef   = useRef<HTMLInputElement>(null)
  const subtaskRef = useRef<HTMLInputElement>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 250, tolerance: 8 } })
  )

  // Инициализация дат из task
  useEffect(() => {
    const raw = task?.due_at ?? task?.due_date
    if (!raw) return
    try {
      const d = new Date(raw)
      setDueDate(d.toISOString().split('T')[0])
      setDueTime(d.toISOString().split('T')[1].slice(0, 5))
    } catch {}
  }, [])

  // Анимация открытия
  useEffect(() => {
    gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2 })
    gsap.fromTo(sheetRef.current,   { y: '100%' },  { y: 0, duration: 0.32, ease: 'power3.out' })
    if (!isEdit) setTimeout(() => titleRef.current?.focus(), 350)
  }, [])

  function close() {
    gsap.to(sheetRef.current,   { y: '100%', duration: 0.24, ease: 'power3.in' })
    gsap.to(overlayRef.current, { opacity: 0, duration: 0.2, onComplete: onClose })
  }

  function buildDueAt(): string | null {
    if (!dueDate) return null
    const s = dueTime ? `${dueDate}T${dueTime}:00` : `${dueDate}T00:00:00`
    return new Date(s).toISOString()
  }

  // ── Drag & drop сабтасков ──────────────────────────────────

  async function handleSubtaskDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIdx    = subtasks.findIndex((s, i) => (s.id ?? `new-${i}`) === active.id)
    const newIdx    = subtasks.findIndex((s, i) => (s.id ?? `new-${i}`) === over.id)
    const reordered = arrayMove(subtasks, oldIdx, newIdx)
    setSubtasks(reordered)

    // Сохраняем порядок только для уже существующих сабтасков
    if (isEdit) {
      const existingReordered = reordered.filter(s => s.id)
      await Promise.all(
        existingReordered.map((s, i) =>
          fetch('/api/tasks/subtasks', {
            method:  'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subtaskId: s.id, userId, position: i }),
          })
        )
      ).catch(() => toast.error('Failed to save order'))
    }
  }

  // ── Добавление нового сабтаска ─────────────────────────────

  function addSubtaskLocal() {
    const trimmed = newSubtask.trim()
    if (!trimmed) return
    setSubtasks(prev => [...prev, { title: trimmed, completed: false }])
    setNewSubtask('')
    subtaskRef.current?.focus()
  }

  // ── Сохранение задачи ──────────────────────────────────────

  async function handleSave() {
    if (!title.trim()) {
      titleRef.current?.focus()
      gsap.fromTo(titleRef.current,
        { x: -6 },
        { x: 0, duration: 0.3, ease: 'elastic.out(1,0.3)' }
      )
      return
    }

    setSaving(true)
    try {
      if (isEdit) {
        // Обновляем саму задачу
        await fetch('/api/tasks', {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId:      task!.id,
            userId,
            title:       title.trim(),
            description,
            priority,
            due_at:      buildDueAt(),
            creator_tz:  getUserTimezone(),
            assigned_to: assignedTo,
          }),
        })

        // Обновляем существующие сабтаски (completed + title)
        for (const s of subtasks) {
          if (s.id) {
            await fetch('/api/tasks/subtasks', {
              method:  'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ subtaskId: s.id, userId, completed: s.completed }),
            })
            // title уже сохранён inline при редактировании (commitEdit)
          } else {
            // Новые сабтаски — создаём
            await fetch('/api/tasks/subtasks', {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ taskId: task!.id, userId, title: s.title }),
            })
          }
        }

        // Удаляем сабтаски которых больше нет в списке
        const keptIds = new Set(subtasks.filter(s => s.id).map(s => s.id))
        for (const orig of task!.subtasks ?? []) {
          if (!keptIds.has(orig.id)) {
            await fetch(`/api/tasks/subtasks?subtaskId=${orig.id}&userId=${userId}`, {
              method: 'DELETE',
            })
          }
        }

        toast.success('Task updated')

      } else {
        // Создаём новую задачу
        const res  = await fetch('/api/tasks', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            listId,
            userId,
            title:       title.trim(),
            description,
            priority,
            due_at:      buildDueAt(),
            creator_tz:  getUserTimezone(),
            assigned_to: assignedTo,
          }),
        })
        const data = await res.json()

        // Создаём сабтаски
        if (data.task?.id && subtasks.length > 0) {
          for (const s of subtasks) {
            await fetch('/api/tasks/subtasks', {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ taskId: data.task.id, userId, title: s.title }),
            })
          }
        }

        toast.success('Task created!')
      }
    } catch {
      toast.error('Failed to save — check connection')
      setSaving(false)
      return
    } finally {
      setSaving(false)
    }

    onSaved()
  }

  // ── Вычисляемые значения ───────────────────────────────────

  const subDone    = subtasks.filter(s => s.completed).length
  const subTotal   = subtasks.length
  const subPct     = subTotal > 0 ? Math.round((subDone / subTotal) * 100) : 0
  const subtaskIds = subtasks.map((s, i) => s.id ?? `new-${i}`)

  const existingDueAt = task?.due_at
  const creatorTz     = task?.creator_tz ?? 'UTC'
  const showDualTime  = isEdit && existingDueAt && creatorTz !== viewerTz

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div ref={overlayRef} className="absolute inset-0 sheet-overlay" onClick={close} />

      <div ref={sheetRef} className="relative w-full bg-bg-surface rounded-t-3xl border-t border-bg-border z-10 max-h-[92dvh] flex flex-col">

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-0 flex-shrink-0">
          <div className="w-9 h-1 bg-bg-border rounded-full" />
        </div>

        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 pt-3 pb-3 border-b border-bg-border/60">
          <div className="flex items-center gap-2.5">
            <h2 className="text-[17px] font-bold text-text-primary">
              {isEdit ? 'Edit Task' : 'New Task'}
            </h2>
            <span className={cn(
              'text-[11px] font-semibold px-2 py-0.5 rounded-lg',
              isEdit ? 'bg-amber/15 text-amber' : 'bg-accent/20 text-accent'
            )}>
              {isEdit ? 'Edit' : 'Create'}
            </span>
          </div>
          <button
            onClick={close}
            className="w-8 h-8 flex items-center justify-center rounded-[10px] bg-bg-hover text-text-secondary"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 min-h-0 relative">

          {/* Overlay сохранения */}
          {saving && (
            <div className="absolute inset-0 z-10 bg-bg-surface/70 backdrop-blur-[2px] rounded-t-3xl pointer-events-auto flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                <p className="text-sm text-text-secondary font-medium">
                  {isEdit ? 'Saving changes...' : 'Creating task...'}
                </p>
              </div>
            </div>
          )}

          <div className="scrollable px-4 py-4 space-y-5 h-full pb-24 overflow-y-auto">

            {/* Title */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary uppercase tracking-widest">
                  <AlignLeft size={12} /> Title
                </label>
                <span className={cn('text-[11px] tabular-nums', title.length > 180 ? 'text-amber' : 'text-text-dim')}>
                  {title.length} / 200
                </span>
              </div>
              <input
                ref={titleRef}
                value={title}
                onChange={e => setTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                placeholder="What needs to be done?"
                className="input-field text-[15px] font-semibold"
                maxLength={200}
              />
            </div>

            {/* Notes */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary uppercase tracking-widest mb-2">
                <AlignLeft size={12} /> Notes
                <span className="text-text-dim font-normal normal-case tracking-normal ml-1">optional</span>
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Add a description or notes…"
                rows={2}
                className="input-field text-sm resize-none leading-relaxed"
                maxLength={1000}
              />
            </div>

            {/* Priority */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary uppercase tracking-widest mb-2.5">
                <Flag size={12} /> Priority
              </label>
              <div className="grid grid-cols-4 gap-2">
                {PRIORITIES.map(p => {
                  const cfg    = PRIORITY_CONFIG[p]
                  const active = priority === p
                  return (
                    <button
                      key={p}
                      onClick={() => setPriority(p)}
                      className={cn(
                        'flex flex-col items-center gap-1 py-2.5 px-1 rounded-[14px] transition-all duration-150 border text-xs font-semibold',
                        active
                          ? `${cfg.color} ${cfg.bg} border-current/30 scale-[1.03]`
                          : 'text-text-secondary bg-bg-card border-bg-border hover:bg-bg-hover'
                      )}
                    >
                      <span className="text-base leading-none">{PRIORITY_ICONS[p]}</span>
                      {cfg.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Due date */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary uppercase tracking-widest mb-2.5">
                <Calendar size={12} /> Due Date & Time
              </label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="input-field text-sm flex-1 min-w-0"
                  style={{ colorScheme: 'dark' }}
                />
                <div className="relative flex-shrink-0">
                  <input
                    type="time"
                    value={dueTime}
                    onChange={e => setDueTime(e.target.value)}
                    className="input-field text-sm pr-9"
                    style={{ colorScheme: 'dark', width: 118 }}
                  />
                  <button
                    onClick={() => {
                      const now = new Date()
                      setDueTime(`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`)
                      if (!dueDate) setDueDate(now.toISOString().split('T')[0])
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-accent hover:text-accent-hover transition-colors"
                    title="Use current time"
                  >
                    <Clock size={14} />
                  </button>
                </div>
              </div>
              {dueDate && (
                <button
                  onClick={() => { setDueDate(''); setDueTime('') }}
                  className="mt-1.5 text-xs text-text-dim hover:text-danger transition-colors flex items-center gap-1"
                >
                  <X size={10} /> Clear date
                </button>
              )}
              <p className="text-[11px] text-text-dim mt-2">
                🌍 <span className="text-text-secondary">{viewerTz}</span>
              </p>
              {showDualTime && (
                <div className="mt-2 bg-bg-card rounded-xl p-3 border border-bg-border/60 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-text-secondary">
                      🗓 Creator · {creatorTz.split('/').pop()?.replace('_', ' ')}
                    </span>
                    <span className="font-medium text-text-primary">
                      {formatInTz(existingDueAt!, creatorTz)}
                    </span>
                  </div>
                  <div className="h-px bg-bg-border/60" />
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-accent">
                      📍 Your time · {viewerTz.split('/').pop()?.replace('_', ' ')}
                    </span>
                    <span className="font-medium text-accent">
                      {formatInTz(existingDueAt!, viewerTz)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Assignee */}
            <AssigneePicker
              listId={listId}
              userId={userId}
              assignedTo={assignedTo}
              onChange={setAssignedTo}
            />

            {/* ── Subtasks ─────────────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary uppercase tracking-widest">
                  <CheckSquare size={12} /> Subtasks
                </label>
                {subTotal > 0 && (
                  <span className="text-[11px] text-text-dim tabular-nums">
                    {subDone}/{subTotal} done
                  </span>
                )}
              </div>

              {/* Progress bar */}
              {subTotal > 0 && (
                <div className="h-[2px] bg-bg-hover rounded-full overflow-hidden mb-3">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width:      `${subPct}%`,
                      background: subPct === 100 ? '#34D399' : '#7B6EF6',
                    }}
                  />
                </div>
              )}

              {/* Список */}
              {subTotal > 0 && (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleSubtaskDragEnd}
                >
                  <SortableContext items={subtaskIds} strategy={verticalListSortingStrategy}>
                    <div className="space-y-1.5 mb-3">
                      {subtasks.map((sub, idx) => (
                        <SortableSubtaskRow
                          key={sub.id ?? `new-${idx}`}
                          sub={sub}
                          idx={idx}
                          userId={userId}
                          isEdit={isEdit}
                          onToggle={() =>
                            setSubtasks(prev =>
                              prev.map((s, i) => i === idx ? { ...s, completed: !s.completed } : s)
                            )
                          }
                          onRename={newTitle =>
                            setSubtasks(prev =>
                              prev.map((s, i) => i === idx ? { ...s, title: newTitle } : s)
                            )
                          }
                          onDelete={() =>
                            setSubtasks(prev => prev.filter((_, i) => i !== idx))
                          }
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}

              {/* Поле добавления */}
              <div className="flex gap-2">
                <input
                  ref={subtaskRef}
                  value={newSubtask}
                  onChange={e => setNewSubtask(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); addSubtaskLocal() }
                  }}
                  placeholder="Add subtask… (Enter ↵)"
                  className="input-field text-sm py-2 flex-1"
                />
                <button
                  onClick={addSubtaskLocal}
                  disabled={!newSubtask.trim()}
                  className="w-10 h-10 flex items-center justify-center rounded-[12px] bg-accent disabled:opacity-35 flex-shrink-0 hover:bg-accent-hover transition-colors active:scale-95"
                >
                  <Plus size={18} className="text-white" strokeWidth={2.5} />
                </button>
              </div>
            </div>

            {/* Edit History */}
            {isEdit && (
              <TaskHistoryPanel taskId={task!.id} userId={userId} />
            )}

          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-4 pt-3 pb-6 border-t border-bg-border/60">
          {!title.trim() && (
            <p className="text-xs text-text-dim text-center mb-2">Add a title to continue</p>
          )}
          <button
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="btn-primary w-full py-3.5 text-[15px] disabled:opacity-40"
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {isEdit ? 'Saving…' : 'Creating…'}
              </span>
            ) : (
              isEdit ? 'Save Changes' : 'Create Task'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}