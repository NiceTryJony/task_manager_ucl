'use client'

import { useEffect, useRef, useState, useCallback, memo, lazy, Suspense } from 'react'
import { gsap } from 'gsap'
import {
  X, Plus, Clock, Calendar, AlignLeft, Flag,
  CheckSquare, GripVertical, User, Check,
} from 'lucide-react'
import {
  DndContext, closestCenter, TouchSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { PRIORITY_CONFIG, cn } from '@/lib/utils'
import type { Priority, Task } from '@/types'
import { toast } from 'sonner'
import { usePending } from '@/hooks/usePending'
import { AssigneePicker } from '@/components/AssigneePicker'
import { useI18n } from '@/lib/i18n-context'
import { apiFetch } from '@/lib/api-client'

// ── Lazy-load TaskHistoryPanel — не нужен при открытии ────────
const TaskHistoryPanel = lazy(() =>
  import('@/components/TaskHistoryPanel').then(m => ({ default: m.TaskHistoryPanel }))
)

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

// ── SortableSubtaskRow — вынесен и memo-изирован ──────────────
// Принимает только примитивы и стабильные коллбэки →
// не ре-рендерится при изменении title/description в родителе

interface SubtaskRowProps {
  sub:      LocalSubtask
  idx:      number
  userId:   number
  isEdit:   boolean
  onToggle: (idx: number) => void
  onRename: (idx: number, newTitle: string) => void
  onDelete: (idx: number) => void
}

const SortableSubtaskRow = memo(function SortableSubtaskRow({
  sub, idx, userId, isEdit, onToggle, onRename, onDelete,
}: SubtaskRowProps) {
  const nodeId = sub.id ?? `new-${idx}`

  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(sub.title)
  const inputRef              = useRef<HTMLInputElement>(null)

  const {
    attributes, listeners, setNodeRef, setActivatorNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: nodeId })

  const style = {
    transform:   CSS.Transform.toString(transform),
    transition:  transition ?? 'transform 150ms ease',
    opacity:     isDragging ? 0.5 : 1,
    zIndex:      isDragging ? 10 : undefined,
    touchAction: 'manipulation' as const,
  }

  function startEdit() {
    if (sub.completed) return
    setDraft(sub.title)
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 40)
  }

  function commitEdit() {
    const trimmed = draft.trim()
    setEditing(false)
    if (!trimmed || trimmed === sub.title) return
    onRename(idx, trimmed)
    if (sub.id && isEdit) {
      apiFetch('/api/tasks/subtasks', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtaskId: sub.id, userId, title: trimmed }),
      }).catch(() => {})
    }
  }

  function cancelEdit() { setEditing(false); setDraft(sub.title) }

  const rowStyle: React.CSSProperties = isDragging
    ? { background: 'rgba(129,115,245,0.10)', border: '0.5px solid rgba(129,115,245,0.30)', boxShadow: '0 4px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08)', borderRadius: 14 }
    : { background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)', borderRadius: 14 }

  return (
    <div ref={setNodeRef} style={style}>
      <div className="flex items-center gap-2.5 px-3 py-2.5 transition-all duration-150" style={rowStyle}>
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className="text-text-dim flex-shrink-0 cursor-grab active:cursor-grabbing p-1 -ml-1 rounded-lg transition-colors touch-none"
          style={{ touchAction: 'none' }}
          tabIndex={-1}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
        >
          <GripVertical size={15} />
        </button>

        <button
          onClick={() => onToggle(idx)}
          className={cn('custom-checkbox flex-shrink-0 transition-all duration-200', sub.completed ? 'checked' : 'unchecked')}
          style={{ touchAction: 'manipulation' }}
        >
          {sub.completed && (
            <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
              <path d="M1 4L4 7L10 1" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

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
                className="flex-1 min-w-0 bg-transparent text-sm text-text-primary outline-none pb-0.5 leading-snug"
                style={{ borderBottom: '1px solid rgba(129,115,245,0.50)' }}
                maxLength={300}
              />
              <button
                onMouseDown={e => { e.preventDefault(); commitEdit() }}
                className="w-5 h-5 flex items-center justify-center rounded-md flex-shrink-0"
                style={{ background: 'rgba(129,115,245,0.18)', color: 'var(--c-accent)' }}
              >
                <Check size={11} strokeWidth={2.5} />
              </button>
            </div>
          ) : (
            <button
              onClick={startEdit}
              disabled={sub.completed}
              className="text-sm text-left w-full leading-snug truncate transition-colors"
              style={{ color: sub.completed ? 'var(--text-dim)' : 'var(--text-primary)', textDecoration: sub.completed ? 'line-through' : 'none' }}
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

        <button
          onClick={() => onDelete(idx)}
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-text-dim transition-all duration-150 active:scale-90"
          style={{ touchAction: 'manipulation' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(240,112,112,0.10)'; (e.currentTarget as HTMLElement).style.color = 'var(--c-danger)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-dim)' }}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
})

// ── SubtasksList — изолированный компонент для DnD ────────────
// Вынесен из TaskSheet чтобы DndContext не пересоздавался
// при изменении title/description/newSubtask в родителе

interface SubtasksListProps {
  subtasks: LocalSubtask[]
  userId:   number
  isEdit:   boolean
  onToggle: (idx: number) => void
  onRename: (idx: number, title: string) => void
  onDelete: (idx: number) => void
  onReorder:(subtasks: LocalSubtask[]) => void
}

const SubtasksList = memo(function SubtasksList({
  subtasks, userId, isEdit, onToggle, onRename, onDelete, onReorder,
}: SubtasksListProps) {
  const sensors = useSensors(
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } })
  )

  const subtaskIds = subtasks.map((s, i) => s.id ?? `new-${i}`)

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIdx = subtasks.findIndex((s, i) => (s.id ?? `new-${i}`) === active.id)
    const newIdx = subtasks.findIndex((s, i) => (s.id ?? `new-${i}`) === over.id)
    const reordered = arrayMove(subtasks, oldIdx, newIdx)

    onReorder(reordered)

    if (isEdit) {
      Promise.all(
        reordered
          .filter(s => s.id)
          .map((s, i) =>
            apiFetch('/api/tasks/subtasks', {
              method:  'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ subtaskId: s.id, userId, position: i }),
            })
          )
      ).catch(() => {})
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={subtaskIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-1.5">
          {subtasks.map((sub, idx) => (
            <SortableSubtaskRow
              key={sub.id ?? `new-${idx}`}
              sub={sub}
              idx={idx}
              userId={userId}
              isEdit={isEdit}
              onToggle={onToggle}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
})

// ── PriorityPicker — изолирован чтобы не ре-рендерить при тайпинге
const PriorityPicker = memo(function PriorityPicker({
  value, onChange, label,
}: { value: Priority; onChange: (p: Priority) => void; label: string }) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary uppercase tracking-widest mb-2.5">
        <Flag size={12} /> {label}
      </label>
      <div className="grid grid-cols-4 gap-2">
        {PRIORITIES.map(p => {
          const cfg    = PRIORITY_CONFIG[p]
          const active = value === p
          return (
            <button
              key={p}
              onClick={() => onChange(p)}
              className="flex flex-col items-center gap-1 py-2.5 px-1 rounded-[14px] transition-all duration-150 text-xs font-semibold"
              style={active
                ? { background: 'rgba(129,115,245,0.10)', border: '0.5px solid rgba(129,115,245,0.30)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)', transform: 'scale(1.03)' }
                : { background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)', color: 'var(--text-secondary)' }
              }
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)' }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)' }}
            >
              <span className="text-base leading-none">{PRIORITY_ICONS[p]}</span>
              {cfg.label}
            </button>
          )
        })}
      </div>
    </div>
  )
})

// ── Main component ────────────────────────────────────────────

export function TaskSheet({ listId, userId, task, onClose, onSaved }: Props) {
  const { t } = useI18n()
  const isEdit = !!task

  // ── UNCONTROLLED refs для полей которые не влияют на UI ──────
  // Ключевая оптимизация: title/description/newSubtask не вызывают ре-рендер
  const titleRef_      = useRef<HTMLInputElement>(null)
  const descriptionRef = useRef<HTMLTextAreaElement>(null)
  const newSubtaskRef_ = useRef<HTMLInputElement>(null)
  const subtaskInputRef = useRef<HTMLInputElement>(null)

  // ── CONTROLLED state — только то что реально влияет на UI ───
  const [priority,   setPriority]   = useState<Priority>(task?.priority ?? 'medium')
  const [dueDate,    setDueDate]     = useState('')
  const [dueTime,    setDueTime]     = useState('')
  const [assignedTo, setAssignedTo] = useState<number[]>(
    task?.assignees?.map(a => a.id) ?? (task?.assigned_to ? [task.assigned_to] : [])
  )
  const [subtasks, setSubtasks] = useState<LocalSubtask[]>(
    task?.subtasks?.map(s => ({ id: s.id, title: s.title, completed: s.completed, creator: s.creator ?? null })) ?? []
  )
  const [saving, setSaving] = useState(false)
  // Defer AssigneePicker монтирование до завершения анимации открытия
  const [showAssignee, setShowAssignee] = useState(false)
  // Lazy history: монтируем только после первого показа
  const [historyMounted, setHistoryMounted] = useState(false)

  const { run } = usePending()
  const [viewerTz] = useState(getUserTimezone)

  const sheetRef   = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  // Char counter для title — отдельный ref чтобы не делать setState
  const charCountRef = useRef<HTMLSpanElement>(null)

  // Stable userId ref
  const userIdRef = useRef(userId)
  useEffect(() => { userIdRef.current = userId }, [userId])

  // ── Init due date ────────────────────────────────────────────
  useEffect(() => {
    const raw = task?.due_at ?? task?.due_date
    if (!raw) return
    try {
      const d = new Date(raw)
      setDueDate(d.toISOString().split('T')[0])
      setDueTime(d.toISOString().split('T')[1].slice(0, 5))
    } catch {}
  }, [])

  // ── Entrance animation + deferred AssigneePicker ─────────────
  useEffect(() => {
    gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2 })
    gsap.fromTo(sheetRef.current,   { y: '100%' },  { y: 0, duration: 0.32, ease: 'power3.out' })

    if (!isEdit) {
      setTimeout(() => titleRef_.current?.focus(), 350)
    }

    // Монтируем AssigneePicker только после завершения анимации
    // чтобы его fetch не конкурировал с GSAP
    const t = setTimeout(() => setShowAssignee(true), 420)
    return () => clearTimeout(t)
  }, [isEdit])

  const close = useCallback(() => {
    gsap.to(sheetRef.current,   { y: '100%', duration: 0.24, ease: 'power3.in' })
    gsap.to(overlayRef.current, { opacity: 0, duration: 0.2, onComplete: onClose })
  }, [onClose])

  const buildDueAt = useCallback((): string | null => {
    if (!dueDate) return null
    const s = dueTime ? `${dueDate}T${dueTime}:00` : `${dueDate}T00:00:00`
    return new Date(s).toISOString()
  }, [dueDate, dueTime])

  // ── Стабильные коллбэки для SubtasksList ────────────────────
  const handleSubtaskToggle = useCallback((idx: number) => {
    setSubtasks(prev => prev.map((s, i) => i === idx ? { ...s, completed: !s.completed } : s))
  }, [])

  const handleSubtaskRename = useCallback((idx: number, newTitle: string) => {
    setSubtasks(prev => prev.map((s, i) => i === idx ? { ...s, title: newTitle } : s))
  }, [])

  const handleSubtaskDelete = useCallback((idx: number) => {
    setSubtasks(prev => prev.filter((_, i) => i !== idx))
  }, [])

  const handleSubtaskReorder = useCallback((reordered: LocalSubtask[]) => {
    setSubtasks(reordered)
  }, [])

  // ── addSubtaskLocal — читает из uncontrolled ref ─────────────
  const addSubtaskLocal = useCallback(() => {
    const trimmed = subtaskInputRef.current?.value.trim()
    if (!trimmed) return
    setSubtasks(prev => [...prev, { title: trimmed, completed: false }])
    if (subtaskInputRef.current) subtaskInputRef.current.value = ''
    subtaskInputRef.current?.focus()
  }, [])

  // ── handleSave — читает uncontrolled refs напрямую ───────────
  const handleSave = useCallback(async () => {
    const titleVal = titleRef_.current?.value?.trim() ?? ''
    const descVal  = descriptionRef.current?.value ?? ''

    if (!titleVal) {
      titleRef_.current?.focus()
      if (titleRef_.current) {
        titleRef_.current?.classList.add('shake')
        setTimeout(() => titleRef_.current?.classList.remove('shake'), 400)
      }
      return
    }

    setSaving(true)
    try {
      if (isEdit) {
        await apiFetch('/api/tasks', {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId:       task!.id,
            userId:       userIdRef.current,
            title:        titleVal,
            description:  descVal,
            priority,
            due_at:       buildDueAt(),
            creator_tz:   getUserTimezone(),
            assignee_ids: assignedTo,
          }),
        })

        await Promise.all(subtasks.map(s =>
          s.id
            ? apiFetch('/api/tasks/subtasks', {
                method:  'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subtaskId: s.id, userId: userIdRef.current, completed: s.completed }),
              })
            : apiFetch('/api/tasks/subtasks', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId: task!.id, userId: userIdRef.current, title: s.title }),
              })
        ))

        const keptIds = new Set(subtasks.filter(s => s.id).map(s => s.id))
        const toDelete = (task!.subtasks ?? []).filter(orig => !keptIds.has(orig.id))
        if (toDelete.length) {
          await Promise.all(
            toDelete.map(orig =>
              apiFetch(`/api/tasks/subtasks?subtaskId=${orig.id}&userId=${userIdRef.current}`, { method: 'DELETE' })
            )
          )
        }

        toast.success(t('taskUpdated'))
      } else {
        const res  = await apiFetch('/api/tasks', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            listId,
            userId:       userIdRef.current,
            title:        titleVal,
            description:  descVal,
            priority,
            due_at:       buildDueAt(),
            creator_tz:   getUserTimezone(),
            assignee_ids: assignedTo,
          }),
        })
        const data = await res.json()

        if (data.task?.id && subtasks.length > 0) {
          await Promise.all(subtasks.map(s =>
            apiFetch('/api/tasks/subtasks', {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ taskId: data.task.id, userId: userIdRef.current, title: s.title }),
            })
          ))
        }

        toast.success(t('taskCreated'))
      }
    } catch {
      toast.error(t('failedToSave'))
      setSaving(false)
      return
    }

    setSaving(false)
    onSaved()
  }, [priority, assignedTo, subtasks, isEdit, task, listId, buildDueAt, t, onSaved])

  const subDone  = subtasks.filter(s => s.completed).length
  const subTotal = subtasks.length
  const subPct   = subTotal > 0 ? Math.round((subDone / subTotal) * 100) : 0

  const existingDueAt = task?.due_at
  const creatorTz     = task?.creator_tz ?? 'UTC'
  const showDualTime  = isEdit && existingDueAt && creatorTz !== viewerTz

  const sectionLabel = 'flex items-center gap-1.5 text-xs font-semibold text-text-secondary uppercase tracking-widest'

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div ref={overlayRef} className="absolute inset-0 sheet-overlay" onClick={close} />

      <div
        ref={sheetRef}
        className="relative w-full flex flex-col"
        style={{
          height:              '92dvh',
          background:          'var(--sheet-bg)',
          backdropFilter:      'var(--glass-blur)',
          WebkitBackdropFilter:'var(--glass-blur)',
          borderRadius:        '24px 24px 0 0',
          borderTop:           '0.5px solid var(--glass-border-top)',
          boxShadow:           'var(--glass-shadow)',
        }}
      >
        <div
          className="absolute top-0 left-12 right-12 h-px pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.14), transparent)' }}
        />

        {/* Handle */}
        {/* <div className="flex justify-center pt-3 flex-shrink-0">
          <div className="w-9 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.12)' }} />
        </div> */}

        {/* Header */}
        <div
          className="flex-shrink-0 flex items-center justify-between px-4 pt-3 pb-3"
          style={{ borderBottom: '0.5px solid rgba(255,255,255,0.07)' }}
        >
          <div className="flex items-center gap-2.5">
            <h2 className="text-[17px] font-bold text-text-primary">
              {isEdit ? t('editTask') : t('newTask')}
            </h2>
            <span
              className="text-[11px] font-semibold px-2 py-0.5 rounded-lg"
              style={isEdit
                ? { background: 'rgba(245,166,35,0.12)', color: 'var(--c-amber)' }
                : { background: 'rgba(129,115,245,0.15)', color: 'var(--c-accent)' }
              }
            >
              {isEdit ? t('edit') : t('creating2')}
            </span>
          </div>
          <button
            onClick={close}
            className="w-8 h-8 flex items-center justify-center rounded-[10px] text-text-secondary transition-colors"
            style={{ background: 'rgba(255,255,255,0.07)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.11)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Scroll container */}
        <div
          className="flex-1 min-h-0 px-4 py-4 pb-28 space-y-5"
          style={{
            overflowY:               'auto',
            overflowX:               'hidden',
            overscrollBehavior:      'contain',
            WebkitOverflowScrolling: 'touch' as any,
            touchAction:             'pan-y',
          }}
        >
          {/* Title — UNCONTROLLED, char counter через DOM ref */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={sectionLabel}>
                <AlignLeft size={12} /> {t('taskTitle')}
              </label>
              <span
                ref={charCountRef}
                className="text-[11px] tabular-nums"
                style={{ color: 'var(--text-dim)' }}
              >
                {(task?.title?.length ?? 0)} / 200
              </span>
            </div>
            <input
              ref={titleRef_}
              defaultValue={task?.title ?? ''}
              onChange={e => {
                // Обновляем счётчик напрямую через DOM — без setState
                if (charCountRef.current) {
                  const len = e.target.value.length
                  charCountRef.current.textContent = `${len} / 200`
                  charCountRef.current.style.color = len > 180 ? 'var(--c-amber)' : 'var(--text-dim)'
                }
              }}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              placeholder={t('whatToBeDone')}
              className="input-field text-[15px] font-semibold"
              maxLength={200}
            />
          </div>

          {/* Notes — UNCONTROLLED */}
          <div>
            <label className={cn(sectionLabel, 'mb-2')}>
              <AlignLeft size={12} /> {t('notes')}
              <span className="text-text-dim font-normal normal-case tracking-normal ml-1">{t('notesOptional')}</span>
            </label>
            <textarea
              ref={descriptionRef}
              defaultValue={task?.description ?? ''}
              placeholder={t('addDescription')}
              rows={2}
              className="input-field text-sm resize-none leading-relaxed"
              maxLength={1000}
            />
          </div>

          {/* Priority — controlled, изолирован в memo */}
          <PriorityPicker value={priority} onChange={setPriority} label={t('priority')} />

          {/* Due date */}
          <div>
            <label className={cn(sectionLabel, 'mb-2.5')}>
              <Calendar size={12} /> {t('dueDateTime')}
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
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: 'var(--c-accent)', touchAction: 'manipulation' }}
                  title={t('useCurrentTime')}
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
                <X size={10} /> {t('clearDate')}
              </button>
            )}
            <p className="text-[11px] text-text-dim mt-2">
              🌍 <span className="text-text-secondary">{viewerTz}</span>
            </p>
            {showDualTime && (
              <div
                className="mt-2 p-3 space-y-2"
                style={{ background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)', borderRadius: 14 }}
              >
                <div className="flex justify-between items-center text-xs">
                  <span className="text-text-secondary">🗓 Creator · {creatorTz.split('/').pop()?.replace('_', ' ')}</span>
                  <span className="font-medium text-text-primary">{formatInTz(existingDueAt!, creatorTz)}</span>
                </div>
                <div className="h-px" style={{ background: 'rgba(255,255,255,0.07)' }} />
                <div className="flex justify-between items-center text-xs">
                  <span style={{ color: 'var(--c-accent)' }}>📍 {viewerTz.split('/').pop()?.replace('_', ' ')}</span>
                  <span className="font-medium" style={{ color: 'var(--c-accent)' }}>{formatInTz(existingDueAt!, viewerTz)}</span>
                </div>
              </div>
            )}
          </div>

          {/* AssigneePicker — defer mount до конца анимации */}
          {showAssignee ? (
            <AssigneePicker
              listId={listId}
              userId={userId}
              assignedTo={assignedTo}
              onChange={setAssignedTo}
              delayFetch={300}
            />
          ) : (
            // Placeholder пока AssigneePicker не смонтирован
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary uppercase tracking-widest mb-2.5">
                <span style={{ width: 12, height: 12, display: 'inline-block' }} /> {t('assignee')}
              </div>
              <div className="flex gap-2.5">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="w-10 h-10 rounded-full skeleton flex-shrink-0" />
                ))}
              </div>
            </div>
          )}

          {/* Subtasks */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <label className={sectionLabel}>
                <CheckSquare size={12} /> {t('subtasks')}
              </label>
              {subTotal > 0 && (
                <span className="text-[11px] text-text-dim tabular-nums">
                  {subDone}/{subTotal} {t('subtasksDone')}
                </span>
              )}
            </div>

            {subTotal > 0 && (
              <div
                className="h-[2px] rounded-full overflow-hidden mb-3"
                style={{ background: 'rgba(255,255,255,0.07)' }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width:     `${subPct}%`,
                    background: subPct === 100 ? 'linear-gradient(90deg,#3ECF8E,#22B97A)' : 'var(--c-accent)',
                    boxShadow:  subPct === 100 ? '0 0 6px rgba(62,207,142,0.40)' : '0 0 6px rgba(129,115,245,0.35)',
                  }}
                />
              </div>
            )}

            {/* SubtasksList — изолированный компонент, не ре-рендерится при тайпинге */}
            {subTotal > 0 && (
              <div className="mb-3">
                <SubtasksList
                  subtasks={subtasks}
                  userId={userId}
                  isEdit={isEdit}
                  onToggle={handleSubtaskToggle}
                  onRename={handleSubtaskRename}
                  onDelete={handleSubtaskDelete}
                  onReorder={handleSubtaskReorder}
                />
              </div>
            )}

            {/* New subtask — UNCONTROLLED input */}
            <div className="flex gap-2">
              <input
                ref={subtaskInputRef}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSubtaskLocal() } }}
                placeholder={t('addSubtask')}
                className="input-field text-sm py-2 flex-1"
              />
              <button
                onClick={addSubtaskLocal}
                className="w-10 h-10 flex items-center justify-center rounded-[12px] opacity-70 hover:opacity-100 flex-shrink-0 transition-all active:scale-95"
                style={{ background: 'var(--c-accent)', touchAction: 'manipulation' }}
              >
                <Plus size={18} className="text-white" strokeWidth={2.5} />
              </button>
            </div>
          </div>

          {/* TaskHistoryPanel — lazy mount */}
          {isEdit && (
            <div>
              {!historyMounted ? (
                <button
                  onClick={() => setHistoryMounted(true)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-sm transition-all duration-200 active:scale-[0.98]"
                  style={{
                    borderRadius: 16,
                    background:   'rgba(255,255,255,0.04)',
                    border:       '1px solid rgba(255,255,255,0.08)',
                    color:        'var(--text-secondary)',
                  }}
                >
                  <span className="flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>
                    {t('editHistory')}
                  </span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-dim)' }}><path d="m6 9 6 6 6-6"/></svg>
                </button>
              ) : (
                <Suspense fallback={
                  <div className="h-12 skeleton rounded-2xl" />
                }>
                  <TaskHistoryPanel taskId={task!.id} userId={userId} />
                </Suspense>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex-shrink-0 px-4 pt-3 pb-6"
          style={{ borderTop: '0.5px solid rgba(255,255,255,0.07)' }}
        >
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary w-full py-3.5 text-[15px] disabled:opacity-40"
            style={{ touchAction: 'manipulation' }}
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <span
                  className="w-4 h-4 border-2 rounded-full"
                  style={{ borderColor: 'rgba(255,255,255,0.25)', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite' }}
                />
                {isEdit ? t('saving') : t('creating')}
              </span>
            ) : (
              isEdit ? t('saveChanges') : t('createTask')
            )}
          </button>
        </div>
      </div>
    </div>
  )
}