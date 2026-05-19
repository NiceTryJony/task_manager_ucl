'use client'

import { useEffect, useRef, useState } from 'react'
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
import { TaskHistoryPanel } from '@/components/TaskHistoryPanel'
import { toast } from 'sonner'
import { usePending } from '@/hooks/usePending'
import { AssigneePicker } from '@/components/AssigneePicker'
import { useI18n } from '@/lib/i18n-context'
import { apiFetch } from '@/lib/api-client'

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

// ── Sortable subtask row ──────────────────────────────────────

interface SubtaskRowProps {
  sub:      LocalSubtask
  idx:      number
  userId:   number
  isEdit:   boolean
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
    onRename(trimmed)
    if (sub.id && isEdit) {
      apiFetch('/api/tasks/subtasks', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtaskId: sub.id, userId, title: trimmed }),
      }).catch(() => {})
    }
  }

  function cancelEdit() {
    setEditing(false)
    setDraft(sub.title)
  }

  const rowStyle: React.CSSProperties = isDragging
    ? {
        background:  'rgba(129,115,245,0.10)',
        border:      '0.5px solid rgba(129,115,245,0.30)',
        boxShadow:   '0 4px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08)',
        borderRadius: 14,
      }
    : {
        background:  'rgba(255,255,255,0.04)',
        border:      '0.5px solid rgba(255,255,255,0.08)',
        boxShadow:   'inset 0 1px 0 rgba(255,255,255,0.05)',
        borderRadius: 14,
      }

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
          onClick={onToggle}
          className={cn(
            'custom-checkbox flex-shrink-0 transition-all duration-200',
            sub.completed ? 'checked' : 'unchecked'
          )}
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
          onClick={onDelete}
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
}

// ── Main component ────────────────────────────────────────────

export function TaskSheet({ listId, userId, task, onClose, onSaved }: Props) {
  const { t } = useI18n()
  const isEdit = !!task

  const [title,       setTitle]       = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [priority,    setPriority]    = useState<Priority>(task?.priority ?? 'medium')
  const [dueDate,     setDueDate]     = useState('')
  const [dueTime,     setDueTime]     = useState('')
  const [assignedTo, setAssignedTo] = useState<number[]>(task?.assignees?.map(a => a.id) ?? (task?.assigned_to ? [task.assigned_to] : []))
  const [subtasks,    setSubtasks]    = useState<LocalSubtask[]>(
    task?.subtasks?.map(s => ({
      id:        s.id,
      title:     s.title,
      completed: s.completed,
      creator:   s.creator ?? null,
    })) ?? []
  )
  const [newSubtask, setNewSubtask] = useState('')
  const [saving,     setSaving]     = useState(false)
  const { run }                     = usePending()
  const [viewerTz]                  = useState(getUserTimezone)

  const sheetRef   = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const titleRef   = useRef<HTMLInputElement>(null)
  const subtaskRef = useRef<HTMLInputElement>(null)

  const sensors = useSensors(
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    })
  )

  useEffect(() => {
    const raw = task?.due_at ?? task?.due_date
    if (!raw) return
    try {
      const d = new Date(raw)
      setDueDate(d.toISOString().split('T')[0])
      setDueTime(d.toISOString().split('T')[1].slice(0, 5))
    } catch {}
  }, [])

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

  async function handleSubtaskDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIdx    = subtasks.findIndex((s, i) => (s.id ?? `new-${i}`) === active.id)
    const newIdx    = subtasks.findIndex((s, i) => (s.id ?? `new-${i}`) === over.id)
    const reordered = arrayMove(subtasks, oldIdx, newIdx)
    setSubtasks(reordered)

    if (isEdit) {
      await Promise.all(
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

  function addSubtaskLocal() {
    const trimmed = newSubtask.trim()
    if (!trimmed) return
    setSubtasks(prev => [...prev, { title: trimmed, completed: false }])
    setNewSubtask('')
    subtaskRef.current?.focus()
  }

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
        await apiFetch('/api/tasks', {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId:       task!.id,
            userId,
            title:        title.trim(),
            description,
            priority,
            due_at:       buildDueAt(),
            creator_tz:   getUserTimezone(),
            assignee_ids: assignedTo,
          }),

        })

        // for (const s of subtasks) {
        //   if (s.id) {
        //     await apiFetch('/api/tasks/subtasks', {
        //       method:  'PATCH',
        //       headers: { 'Content-Type': 'application/json' },
        //       body: JSON.stringify({ subtaskId: s.id, userId, completed: s.completed }),
        //     })
        //   } else {
        //     await apiFetch('/api/tasks/subtasks', {
        //       method:  'POST',
        //       headers: { 'Content-Type': 'application/json' },
        //       body: JSON.stringify({ taskId: task!.id, userId, title: s.title }),
        //     })
        //   }
        // }

        await Promise.all(subtasks.map(s => 
        s.id
            ? apiFetch('/api/tasks/subtasks', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subtaskId: s.id, userId, completed: s.completed }),
              })
            : apiFetch('/api/tasks/subtasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId: task!.id, userId, title: s.title }),
              })
        ))

        const keptIds = new Set(subtasks.filter(s => s.id).map(s => s.id))
        await Promise.all(
          (task!.subtasks ?? [])
            .filter(orig => !keptIds.has(orig.id))
            .map(orig => apiFetch(`/api/tasks/subtasks?subtaskId=${orig.id}&userId=${userId}`, { method: 'DELETE' }))
        )

        toast.success(t('taskUpdated'))

      } else {
        const res  = await apiFetch('/api/tasks', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            listId,
            userId,
            title:        title.trim(),
            description,
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
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ taskId: data.task.id, userId, title: s.title }),
            })
          ))
        }

        toast.success(t('taskCreated'))
      }
    } catch {
      toast.error(t('failedToSave'))
      setSaving(false)
      return
    } finally {
      setSaving(false)
    }

    onSaved()
  }

  const subDone    = subtasks.filter(s => s.completed).length
  const subTotal   = subtasks.length
  const subPct     = subTotal > 0 ? Math.round((subDone / subTotal) * 100) : 0
  const subtaskIds = subtasks.map((s, i) => s.id ?? `new-${i}`)

  const existingDueAt = task?.due_at
  const creatorTz     = task?.creator_tz ?? 'UTC'
  const showDualTime  = isEdit && existingDueAt && creatorTz !== viewerTz

  // Section label style
  const sectionLabel = "flex items-center gap-1.5 text-xs font-semibold text-text-secondary uppercase tracking-widest"

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
        {/* Top shimmer */}
        <div
          className="absolute top-0 left-12 right-12 h-px pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.14), transparent)' }}
        />

        {/* Handle */}
        <div className="flex justify-center pt-3 flex-shrink-0">
          <div className="w-9 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.12)' }} />
        </div>

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
          {/* Saving overlay */}
          {saving && (
            <div
              className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-auto"
              style={{ background: 'rgba(14,16,26,0.65)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
            >
              <div className="flex flex-col items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full border-2"
                  style={{ borderColor: 'rgba(129,115,245,0.25)', borderTopColor: 'var(--c-accent)', animation: 'spin 0.7s linear infinite' }}
                />
                <p className="text-sm text-text-secondary font-medium">
                  {isEdit ? t('savingChanges') : t('creatingTaskStr')}
                </p>
              </div>
            </div>
          )}

          {/* Title */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={sectionLabel}>
                <AlignLeft size={12} /> {t('taskTitle')}
              </label>
              <span
                className="text-[11px] tabular-nums"
                style={{ color: title.length > 180 ? 'var(--c-amber)' : 'var(--text-dim)' }}
              >
                {title.length} / 200
              </span>
            </div>
            <input
              ref={titleRef}
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              placeholder={t('whatToBeDone')}
              className="input-field text-[15px] font-semibold"
              maxLength={200}
            />
          </div>

          {/* Notes */}
          <div>
            <label className={cn(sectionLabel, "mb-2")}>
              <AlignLeft size={12} /> {t('notes')}
              <span className="text-text-dim font-normal normal-case tracking-normal ml-1">{t('notesOptional')}</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={t('addDescription')}
              rows={2}
              className="input-field text-sm resize-none leading-relaxed"
              maxLength={1000}
            />
          </div>

          {/* Priority */}
          <div>
            <label className={cn(sectionLabel, "mb-2.5")}>
              <Flag size={12} /> {t('priority')}
            </label>
            <div className="grid grid-cols-4 gap-2">
              {PRIORITIES.map(p => {
                const cfg    = PRIORITY_CONFIG[p]
                const active = priority === p
                return (
                  <button
                    key={p}
                    onClick={() => setPriority(p)}
                    className="flex flex-col items-center gap-1 py-2.5 px-1 rounded-[14px] transition-all duration-150 text-xs font-semibold"
                    style={active
                      ? {
                          color:      cfg.color.replace('text-', ''),
                          background: 'rgba(129,115,245,0.10)',
                          border:     '0.5px solid rgba(129,115,245,0.30)',
                          boxShadow:  'inset 0 1px 0 rgba(255,255,255,0.07)',
                          transform:  'scale(1.03)',
                        }
                      : {
                          background: 'rgba(255,255,255,0.04)',
                          border:     '0.5px solid rgba(255,255,255,0.08)',
                          color:      'var(--text-secondary)',
                        }
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

          {/* Due date */}
          <div>
            <label className={cn(sectionLabel, "mb-2.5")}>
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
                style={{
                  background:   'rgba(255,255,255,0.04)',
                  border:       '0.5px solid rgba(255,255,255,0.08)',
                  boxShadow:    'inset 0 1px 0 rgba(255,255,255,0.05)',
                  borderRadius: 14,
                }}
              >
                <div className="flex justify-between items-center text-xs">
                  <span className="text-text-secondary">
                    🗓 Creator · {creatorTz.split('/').pop()?.replace('_', ' ')}
                  </span>
                  <span className="font-medium text-text-primary">
                    {formatInTz(existingDueAt!, creatorTz)}
                  </span>
                </div>
                <div className="h-px" style={{ background: 'rgba(255,255,255,0.07)' }} />
                <div className="flex justify-between items-center text-xs">
                  <span style={{ color: 'var(--c-accent)' }}>
                    📍 {viewerTz.split('/').pop()?.replace('_', ' ')}
                  </span>
                  <span className="font-medium" style={{ color: 'var(--c-accent)' }}>
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
                    width:      `${subPct}%`,
                    background: subPct === 100
                      ? 'linear-gradient(90deg,#3ECF8E,#22B97A)'
                      : 'var(--c-accent)',
                    boxShadow:  subPct === 100
                      ? '0 0 6px rgba(62,207,142,0.40)'
                      : '0 0 6px rgba(129,115,245,0.35)',
                  }}
                />
              </div>
            )}

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

            <div className="flex gap-2">
              <input
                ref={subtaskRef}
                value={newSubtask}
                onChange={e => setNewSubtask(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); addSubtaskLocal() }
                }}
                placeholder={t('addSubtask')}
                className="input-field text-sm py-2 flex-1"
              />
              <button
                onClick={addSubtaskLocal}
                disabled={!newSubtask.trim()}
                className="w-10 h-10 flex items-center justify-center rounded-[12px] disabled:opacity-35 flex-shrink-0 transition-all active:scale-95"
                style={{
                  background:   'var(--c-accent)',
                  touchAction:  'manipulation',
                }}
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

        {/* Footer */}
        <div
          className="flex-shrink-0 px-4 pt-3 pb-6"
          style={{ borderTop: '0.5px solid rgba(255,255,255,0.07)' }}
        >
          {!title.trim() && (
            <p className="text-xs text-text-dim text-center mb-2">{t('addTitle')}</p>
          )}
          <button
            onClick={handleSave}
            disabled={!title.trim() || saving}
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