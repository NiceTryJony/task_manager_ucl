'use client'

import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { X, Plus, Trash2, Clock } from 'lucide-react'
import { PRIORITY_CONFIG, cn } from '@/lib/utils'
import type { Priority, Task, Subtask } from '@/types'
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
  // Subtasks work both in create and edit mode
  const [subtasks,    setSubtasks]    = useState<Array<{ id?: string; title: string; completed: boolean }>>(
    task?.subtasks?.map(s => ({ id: s.id, title: s.title, completed: s.completed })) ?? []
  )
  const [newSubtask,  setNewSubtask]  = useState('')
  const [saving,      setSaving]      = useState(false)
  const [viewerTz]                    = useState(getUserTimezone())

  const sheetRef   = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const subtaskRef = useRef<HTMLInputElement>(null)

  // Parse existing due_at
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
    gsap.fromTo(sheetRef.current, { y: '100%' }, { y: 0, duration: 0.35, ease: 'power3.out' })
  }, [])

  function close() {
    gsap.to(sheetRef.current,   { y: '100%', duration: 0.25, ease: 'power3.in' })
    gsap.to(overlayRef.current, { opacity: 0, duration: 0.2, onComplete: onClose })
  }

  function buildDueAt() {
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

  function removeSubtaskLocal(idx: number) {
    setSubtasks(prev => prev.filter((_, i) => i !== idx))
  }

  function toggleSubtaskLocal(idx: number) {
    setSubtasks(prev => prev.map((s, i) => i === idx ? { ...s, completed: !s.completed } : s))
  }

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    const due_at     = buildDueAt()
    const creator_tz = getUserTimezone()

    if (isEdit) {
      // Update task
      await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: task!.id, userId,
          title: title.trim(), description, priority, due_at, creator_tz,
        }),
      })
      // Sync subtasks: add new ones, update existing
      for (const s of subtasks) {
        if (!s.id) {
          // New subtask added during edit
          await fetch('/api/tasks/subtasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId: task!.id, userId, title: s.title }),
          })
        } else {
          await fetch('/api/tasks/subtasks', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subtaskId: s.id, userId, completed: s.completed }),
          })
        }
      }
      // Delete removed subtasks
      const currentIds = new Set(subtasks.filter(s => s.id).map(s => s.id))
      for (const orig of task!.subtasks ?? []) {
        if (!currentIds.has(orig.id)) {
          await fetch(`/api/tasks/subtasks?subtaskId=${orig.id}&userId=${userId}`, { method: 'DELETE' })
        }
      }
      toast.success('Task updated')
    } else {
      // Create task
      const res  = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listId, userId, title: title.trim(), description, priority, due_at, creator_tz,
        }),
      })
      const data = await res.json()
      // Create subtasks if any were added
      if (data.task?.id && subtasks.length > 0) {
        for (const s of subtasks) {
          await fetch('/api/tasks/subtasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId: data.task.id, userId, title: s.title }),
          })
        }
      }
      toast.success('Task created!')
    }
    setSaving(false)
    onSaved()
  }

  const existingDueAt = task?.due_at
  const creatorTz     = task?.creator_tz ?? 'UTC'
  const showDualTime  = isEdit && existingDueAt && creatorTz !== viewerTz

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div ref={overlayRef} className="absolute inset-0 sheet-overlay" onClick={close} />
      <div ref={sheetRef} className="relative w-full bg-bg-surface rounded-t-3xl border-t border-bg-border z-10 max-h-[92dvh] flex flex-col">

        <div className="flex-shrink-0 px-4 pt-3 pb-4">
          <div className="w-10 h-1 bg-bg-border rounded-full mx-auto mb-4" />
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">{isEdit ? 'Edit Task' : 'New Task'}</h2>
            <button onClick={close} className="btn-ghost p-2"><X size={18} /></button>
          </div>
        </div>

        <div className="flex-1 scrollable px-4 pb-4 space-y-4">
          {/* Title */}
          <div>
            <input
              autoFocus={!isEdit}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Task title…"
              className="input-field text-base font-semibold"
              maxLength={200}
            />
            <p className="text-right text-xs text-text-dim mt-1">{title.length}/200</p>
          </div>

          {/* Description */}
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Notes (optional)…"
            rows={2}
            className="input-field text-sm resize-none"
            maxLength={1000}
          />

          {/* Priority */}
          <div>
            <label className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-2 block">Priority</label>
            <div className="flex gap-2">
              {PRIORITIES.map(p => {
                const cfg = PRIORITY_CONFIG[p]
                return (
                  <button key={p} onClick={() => setPriority(p)}
                    className={cn('flex-1 py-2 rounded-xl text-xs font-semibold transition-all',
                      priority === p ? `${cfg.color} ${cfg.bg} ring-1 ring-current` : 'text-text-secondary bg-bg-card'
                    )}>
                    {cfg.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Due date + time */}
          <div>
            <label className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-2 block">Due Date & Time</label>
            <div className="flex gap-2">
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="input-field text-sm flex-1" style={{ colorScheme: 'dark' }} />
              <div className="relative flex-shrink-0">
                <input type="time" value={dueTime} onChange={e => setDueTime(e.target.value)}
                  className="input-field text-sm pr-8" style={{ colorScheme: 'dark', width: 120 }} />
                <button onClick={() => {
                  const now = new Date()
                  setDueTime(`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`)
                  if (!dueDate) setDueDate(now.toISOString().split('T')[0])
                }} className="absolute right-2 top-1/2 -translate-y-1/2 text-accent" title="Use current time">
                  <Clock size={14} />
                </button>
              </div>
            </div>
            <p className="text-xs text-text-dim mt-1.5">
              🌍 Your timezone: <span className="text-text-secondary">{viewerTz}</span>
            </p>
            {showDualTime && (
              <div className="mt-2 bg-bg-card rounded-xl p-3 border border-bg-border space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-text-secondary">Creator ({creatorTz.split('/').pop()})</span>
                  <span className="text-text-primary font-medium">{formatInTz(existingDueAt!, creatorTz)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-accent">Your local time</span>
                  <span className="text-accent font-medium">{formatInTz(existingDueAt!, viewerTz)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Subtasks — available both on create and edit */}
          <div>
            <label className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-2 block">
              Subtasks {subtasks.length > 0 && `(${subtasks.filter(s => s.completed).length}/${subtasks.length})`}
            </label>

            {subtasks.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {subtasks.map((sub, idx) => (
                  <div key={idx} className="flex items-center gap-2 group">
                    <button onClick={() => toggleSubtaskLocal(idx)}
                      className={cn('custom-checkbox flex-shrink-0', sub.completed ? 'checked' : 'unchecked')}>
                      {sub.completed && (
                        <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                          <path d="M1 4L4 7L10 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </button>
                    <span className={cn('flex-1 text-sm', sub.completed && 'line-through text-text-secondary')}>
                      {sub.title}
                    </span>
                    <button onClick={() => removeSubtaskLocal(idx)}
                      className="opacity-0 group-hover:opacity-100 text-text-dim hover:text-danger transition-all p-1">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <input
                ref={subtaskRef}
                value={newSubtask}
                onChange={e => setNewSubtask(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addSubtaskLocal()}
                placeholder="Add subtask…"
                className="input-field text-sm py-2"
              />
              <button onClick={addSubtaskLocal} disabled={!newSubtask.trim()}
                className="btn-primary px-3 py-2 disabled:opacity-40 flex-shrink-0">
                <Plus size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-shrink-0 px-4 pb-6 pt-3 border-t border-bg-border">
          <button onClick={handleSave} disabled={!title.trim() || saving}
            className="btn-primary w-full py-3.5 text-base disabled:opacity-40">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  )
}