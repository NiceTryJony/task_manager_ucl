'use client'

import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { X, Plus, Trash2, Clock, Calendar, AlignLeft, Flag, CheckSquare } from 'lucide-react'
import { PRIORITY_CONFIG, cn } from '@/lib/utils'
import type { Priority, Task } from '@/types'
import { useTaskStore } from '@/lib/store'
import { toast } from 'sonner'

interface Props {
  listId:  string
  userId:  number
  task?:   Task
  onClose: () => void
  onSaved: () => void
}

const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent']

const PRIORITY_ICONS: Record<Priority, string> = {
  low:    '○',
  medium: '◑',
  high:   '●',
  urgent: '⚠',
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

export function TaskSheet({ listId, userId, task, onClose, onSaved }: Props) {
  const { updateSubtasks } = useTaskStore()
  const isEdit = !!task

  const [title,       setTitle]       = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [priority,    setPriority]    = useState<Priority>(task?.priority ?? 'medium')
  const [dueDate,     setDueDate]     = useState('')
  const [dueTime,     setDueTime]     = useState('')
  const [subtasks,    setSubtasks]    = useState<Array<{ id?: string; title: string; completed: boolean }>>(
    task?.subtasks?.map(s => ({ id: s.id, title: s.title, completed: s.completed })) ?? []
  )
  const [newSubtask, setNewSubtask] = useState('')
  const [saving,     setSaving]     = useState(false)
  const [viewerTz]                  = useState(getUserTimezone)

  const sheetRef   = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const titleRef   = useRef<HTMLInputElement>(null)
  const subtaskRef = useRef<HTMLInputElement>(null)

  // Parse existing due_at on mount
  useEffect(() => {
    const raw = task?.due_at ?? task?.due_date
    if (!raw) return
    try {
      const d = new Date(raw)
      setDueDate(d.toISOString().split('T')[0])
      setDueTime(d.toISOString().split('T')[1].slice(0, 5))
    } catch {}
  }, [])

  // Sheet open animation
  useEffect(() => {
    gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2 })
    gsap.fromTo(sheetRef.current,   { y: '100%' },  { y: 0, duration: 0.32, ease: 'power3.out' })
    // Autofocus title after animation
    if (!isEdit) setTimeout(() => titleRef.current?.focus(), 350)
  }, [])

  function close() {
    gsap.to(sheetRef.current,   { y: '100%', duration: 0.24, ease: 'power3.in' })
    gsap.to(overlayRef.current, { opacity: 0, duration: 0.2, onComplete: onClose })
  }

  function buildDueAt(): string | null {
    if (!dueDate) return null
    const localStr = dueTime ? `${dueDate}T${dueTime}:00` : `${dueDate}T00:00:00`
    return new Date(localStr).toISOString()
  }

  function addSubtaskLocal() {
    if (!newSubtask.trim()) return
    setSubtasks(prev => [...prev, { title: newSubtask.trim(), completed: false }])
    setNewSubtask('')
    subtaskRef.current?.focus()
  }

  const subDone  = subtasks.filter(s => s.completed).length
  const subTotal = subtasks.length
  const subPct   = subTotal > 0 ? Math.round((subDone / subTotal) * 100) : 0

  async function handleSave() {
    if (!title.trim()) {
      titleRef.current?.focus()
      gsap.fromTo(titleRef.current,
        { x: -6 }, { x: 0, duration: 0.3, ease: 'elastic.out(1,0.3)' }
      )
      return
    }
    setSaving(true)
    const due_at     = buildDueAt()
    const creator_tz = getUserTimezone()

    try {
      if (isEdit) {
        await fetch('/api/tasks', {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId: task!.id, userId,
            title: title.trim(), description, priority, due_at, creator_tz,
          }),
        })

        // Sync subtasks
        for (const s of subtasks) {
          if (!s.id) {
            await fetch('/api/tasks/subtasks', {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ taskId: task!.id, userId, title: s.title }),
            })
          } else {
            await fetch('/api/tasks/subtasks', {
              method:  'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ subtaskId: s.id, userId, completed: s.completed }),
            })
          }
        }
        // Delete removed subtasks
        const kept = new Set(subtasks.filter(s => s.id).map(s => s.id))
        for (const orig of task!.subtasks ?? []) {
          if (!kept.has(orig.id)) {
            await fetch(`/api/tasks/subtasks?subtaskId=${orig.id}&userId=${userId}`, { method: 'DELETE' })
          }
        }
        toast.success('Task updated')

      } else {
        const res  = await fetch('/api/tasks', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listId, userId, title: title.trim(), description, priority, due_at, creator_tz }),
        })
        const data = await res.json()

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
    } finally {
      setSaving(false)
    }
    onSaved()
  }

  const existingDueAt = task?.due_at
  const creatorTz     = task?.creator_tz ?? 'UTC'
  const showDualTime  = isEdit && existingDueAt && creatorTz !== viewerTz

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div ref={overlayRef} className="absolute inset-0 sheet-overlay" onClick={close} />

      <div
        ref={sheetRef}
        className="relative w-full bg-bg-surface rounded-t-3xl border-t border-bg-border z-10 max-h-[92dvh] flex flex-col"
      >
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
              isEdit
                ? 'bg-amber/15 text-amber'
                : 'bg-accent/20 text-accent'
            )}>
              {isEdit ? 'Edit' : 'Create'}
            </span>
          </div>
          <button
            onClick={close}
            className="w-8 h-8 flex items-center justify-center rounded-[10px] bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 scrollable px-4 py-4 space-y-5">

          {/* ── Title ────────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary uppercase tracking-widest">
                <AlignLeft size={12} />
                Title
              </label>
              <span className={cn(
                'text-[11px] tabular-nums transition-colors',
                title.length > 180 ? 'text-amber' : 'text-text-dim'
              )}>
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

          {/* ── Notes ────────────────────────────────────────── */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary uppercase tracking-widest mb-2">
              <AlignLeft size={12} />
              Notes
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

          {/* ── Priority ─────────────────────────────────────── */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary uppercase tracking-widest mb-2.5">
              <Flag size={12} />
              Priority
            </label>
            <div className="grid grid-cols-4 gap-2">
              {PRIORITIES.map(p => {
                const cfg     = PRIORITY_CONFIG[p]
                const active  = priority === p
                return (
                  <button
                    key={p}
                    onClick={() => setPriority(p)}
                    className={cn(
                      'flex flex-col items-center gap-1 py-2.5 px-1 rounded-[14px] transition-all duration-150',
                      'border text-xs font-semibold',
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

          {/* ── Due Date & Time ───────────────────────────────── */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary uppercase tracking-widest mb-2.5">
              <Calendar size={12} />
              Due Date & Time
            </label>

            <div className="flex gap-2">
              {/* Date */}
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="input-field text-sm flex-1 min-w-0"
                style={{ colorScheme: 'dark' }}
              />
              {/* Time */}
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
                    setDueTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`)
                    if (!dueDate) setDueDate(now.toISOString().split('T')[0])
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-accent hover:text-accent-hover transition-colors"
                  title="Use current time"
                >
                  <Clock size={14} />
                </button>
              </div>
            </div>

            {/* Clear date button */}
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

            {/* Dual timezone display */}
            {showDualTime && (
              <div className="mt-2 bg-bg-card rounded-xl p-3 border border-bg-border/60 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-text-secondary flex items-center gap-1">
                    <span className="text-[10px]">🗓</span>
                    Creator · {creatorTz.split('/').pop()?.replace('_', ' ')}
                  </span>
                  <span className="font-medium text-text-primary">
                    {formatInTz(existingDueAt!, creatorTz)}
                  </span>
                </div>
                <div className="h-px bg-bg-border/60" />
                <div className="flex justify-between items-center text-xs">
                  <span className="text-accent flex items-center gap-1">
                    <span className="text-[10px]">📍</span>
                    Your time · {viewerTz.split('/').pop()?.replace('_', ' ')}
                  </span>
                  <span className="font-medium text-accent">
                    {formatInTz(existingDueAt!, viewerTz)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* ── Subtasks ──────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary uppercase tracking-widest">
                <CheckSquare size={12} />
                Subtasks
              </label>
              {subTotal > 0 && (
                <span className="text-[11px] text-text-dim">
                  {subDone}/{subTotal} done
                </span>
              )}
            </div>

            {/* Subtask progress */}
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

            {/* Subtask list */}
            {subTotal > 0 && (
              <div className="space-y-1.5 mb-3">
                {subtasks.map((sub, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2.5 px-3 py-2 bg-bg-card rounded-[12px] border border-bg-border/60 group"
                  >
                    {/* Checkbox */}
                    <button
                      onClick={() => setSubtasks(prev =>
                        prev.map((s, i) => i === idx ? { ...s, completed: !s.completed } : s)
                      )}
                      className={cn(
                        'custom-checkbox flex-shrink-0',
                        sub.completed ? 'checked' : 'unchecked'
                      )}
                    >
                      {sub.completed && (
                        <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                          <path d="M1 4L4 7L10 1" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>

                    {/* Text */}
                    <span className={cn(
                      'flex-1 text-sm leading-snug',
                      sub.completed ? 'line-through text-text-dim' : 'text-text-primary'
                    )}>
                      {sub.title}
                    </span>

                    {/* Delete */}
                    <button
                      onClick={() => setSubtasks(prev => prev.filter((_, i) => i !== idx))}
                      className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-lg text-text-dim hover:text-danger hover:bg-danger/10 transition-all"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add subtask */}
            <div className="flex gap-2">
              <input
                ref={subtaskRef}
                value={newSubtask}
                onChange={e => setNewSubtask(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSubtaskLocal() } }}
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

        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-4 pt-3 pb-6 border-t border-bg-border/60">
          {/* Completeness hint */}
          {!title.trim() && (
            <p className="text-xs text-text-dim text-center mb-2">
              Add a title to continue
            </p>
          )}
          <button
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="btn-primary w-full py-3.5 text-[15px] disabled:opacity-40 relative overflow-hidden"
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