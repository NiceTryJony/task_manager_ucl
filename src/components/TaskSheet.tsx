'use client'

import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { X, Plus, Trash2, Calendar, ChevronDown } from 'lucide-react'
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

export function TaskSheet({ listId, userId, task, onClose, onSaved }: Props) {
  const { updateSubtasks } = useTaskStore()
  const isEdit = !!task

  const [title,       setTitle]       = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [priority,    setPriority]    = useState<Priority>(task?.priority ?? 'medium')
  const [dueDate,     setDueDate]     = useState(task?.due_date ?? '')
  const [subtasks,    setSubtasks]    = useState<Subtask[]>(task?.subtasks ?? [])
  const [newSubtask,  setNewSubtask]  = useState('')
  const [saving,      setSaving]      = useState(false)

  const sheetRef   = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2 })
    gsap.fromTo(sheetRef.current,   { y: '100%' }, { y: 0, duration: 0.35, ease: 'power3.out' })
  }, [])

  function close() {
    gsap.to(sheetRef.current,   { y: '100%', duration: 0.25, ease: 'power3.in' })
    gsap.to(overlayRef.current, { opacity: 0, duration: 0.2, onComplete: onClose })
  }

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)

    if (isEdit) {
      await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: task!.id, userId,
          title: title.trim(), description, priority,
          due_date: dueDate || null,
        }),
      })
      toast.success('Task updated')
    } else {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listId, userId,
          title: title.trim(), description, priority,
          due_date: dueDate || null,
        }),
      })
      toast.success('Task created!')
    }
    setSaving(false)
    onSaved()
  }

  async function addSubtask() {
    if (!newSubtask.trim() || !isEdit) return
    const res  = await fetch('/api/tasks/subtasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: task!.id, userId, title: newSubtask.trim() }),
    })
    const data = await res.json()
    if (data.subtask) {
      const updated = [...subtasks, data.subtask]
      setSubtasks(updated)
      updateSubtasks(task!.id, listId, updated)
    }
    setNewSubtask('')
  }

  async function toggleSubtask(sub: Subtask) {
    const updated = subtasks.map(s =>
      s.id === sub.id ? { ...s, completed: !s.completed } : s
    )
    setSubtasks(updated)
    updateSubtasks(task!.id, listId, updated)

    await fetch('/api/tasks/subtasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subtaskId: sub.id, userId, completed: !sub.completed }),
    })
  }

  async function deleteSubtask(sub: Subtask) {
    const updated = subtasks.filter(s => s.id !== sub.id)
    setSubtasks(updated)
    updateSubtasks(task!.id, listId, updated)

    await fetch(`/api/tasks/subtasks?subtaskId=${sub.id}&userId=${userId}`, { method: 'DELETE' })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div ref={overlayRef} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} />

      <div ref={sheetRef} className="relative w-full bg-bg-surface rounded-t-3xl border-t border-bg-border z-10 max-h-[92dvh] flex flex-col">
        <div className="flex-shrink-0 px-4 pt-3">
          <div className="w-10 h-1 bg-bg-border rounded-full mx-auto mb-4" />
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">{isEdit ? 'Edit Task' : 'New Task'}</h2>
            <button onClick={close} className="btn-ghost p-2"><X size={18} /></button>
          </div>
        </div>

        <div className="flex-1 scrollable px-4 pb-4 space-y-4">
          {/* Title */}
          <input
            autoFocus={!isEdit}
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Task title…"
            className="input-field text-base font-semibold"
            maxLength={200}
          />

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
            <label className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-2 block">
              Priority
            </label>
            <div className="flex gap-2">
              {PRIORITIES.map(p => {
                const cfg = PRIORITY_CONFIG[p]
                return (
                  <button
                    key={p}
                    onClick={() => setPriority(p)}
                    className={cn(
                      'flex-1 py-2 rounded-xl text-xs font-semibold transition-all',
                      priority === p
                        ? `${cfg.color} ${cfg.bg} ring-1 ring-current`
                        : 'text-text-secondary bg-bg-card'
                    )}
                  >
                    {cfg.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Due date */}
          <div>
            <label className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-2 block">
              Due Date
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="input-field text-sm"
              style={{ colorScheme: 'dark' }}
            />
          </div>

          {/* Subtasks (only when editing) */}
          {isEdit && (
            <div>
              <label className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-2 block">
                Subtasks ({subtasks.filter(s => s.completed).length}/{subtasks.length})
              </label>

              <div className="space-y-1.5 mb-2">
                {subtasks.map(sub => (
                  <div key={sub.id} className="flex items-center gap-2 group">
                    <button
                      onClick={() => toggleSubtask(sub)}
                      className={cn('custom-checkbox', sub.completed ? 'checked' : 'unchecked')}
                    >
                      {sub.completed && (
                        <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                          <path d="M1 4L4 7L10 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </button>
                    <span className={cn(
                      'flex-1 text-sm',
                      sub.completed && 'line-through text-text-secondary'
                    )}>
                      {sub.title}
                    </span>
                    <button
                      onClick={() => deleteSubtask(sub)}
                      className="opacity-0 group-hover:opacity-100 text-text-dim hover:text-danger transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add subtask */}
              <div className="flex gap-2">
                <input
                  value={newSubtask}
                  onChange={e => setNewSubtask(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addSubtask()}
                  placeholder="Add subtask…"
                  className="input-field text-sm py-2"
                />
                <button
                  onClick={addSubtask}
                  disabled={!newSubtask.trim()}
                  className="btn-primary px-3 py-2 disabled:opacity-40"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
          )}

          {!isEdit && (
            <p className="text-xs text-text-dim text-center">
              You can add subtasks after creating the task
            </p>
          )}
        </div>

        <div className="flex-shrink-0 px-4 pb-6 pt-3 border-t border-bg-border">
          <button
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="btn-primary w-full py-3.5 text-base disabled:opacity-40"
          >
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  )
}
