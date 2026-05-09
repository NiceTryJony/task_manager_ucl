'use client'

import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import {
  X, Calendar, Flag, AlignLeft, CheckSquare,
  Clock, User,
} from 'lucide-react'
import { PRIORITY_CONFIG, cn } from '@/lib/utils'
import type { Task, Subtask } from '@/types'
import { TaskHistoryPanel } from '@/components/TaskHistoryPanel'
import { toast } from 'sonner'

interface Props {
  task:               Task
  userId:             number
  onClose:            () => void
  onSubtaskToggled?:  () => void
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

export function ViewerTaskSheet({ task, userId, onClose, onSubtaskToggled }: Props) {
  const [subtasks,    setSubtasks]    = useState<Subtask[]>(task.subtasks ?? [])
  const [togglingId,  setTogglingId]  = useState<string | null>(null)

  const sheetRef   = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const viewerTz   = getUserTimezone()

  const priority = PRIORITY_CONFIG[task.priority]
  const dueAt    = task.due_at ?? task.due_date
  const subDone  = subtasks.filter(s => s.completed).length
  const subTotal = subtasks.length
  const subPct   = subTotal > 0 ? Math.round((subDone / subTotal) * 100) : 0

  useEffect(() => {
    gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2 })
    gsap.fromTo(sheetRef.current,   { y: '100%' },  { y: 0, duration: 0.32, ease: 'power3.out' })
  }, [])

  function close() {
    gsap.to(sheetRef.current,   { y: '100%', duration: 0.24, ease: 'power3.in' })
    gsap.to(overlayRef.current, { opacity: 0, duration: 0.2, onComplete: onClose })
  }

  // Viewers CAN toggle subtask completion — this is logged server-side
  async function handleToggleSubtask(sub: Subtask) {
    setTogglingId(sub.id)
    const next = !sub.completed
    setSubtasks(prev => prev.map(s => s.id === sub.id ? { ...s, completed: next } : s))
    const res  = await fetch('/api/tasks/subtasks', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subtaskId: sub.id, userId, completed: next }),
    })
    const data = await res.json()
    if (!res.ok) {
      toast.error(data.error ?? 'Failed to update')
      setSubtasks(prev => prev.map(s => s.id === sub.id ? { ...s, completed: sub.completed } : s))
    } else {
      onSubtaskToggled?.()
    }
    setTogglingId(null)
  }

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
            <h2 className="text-[17px] font-bold text-text-primary">View Task</h2>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-text-dim/20 text-text-secondary">
              Read-only
            </span>
          </div>
          <button
            onClick={close}
            className="w-8 h-8 flex items-center justify-center rounded-[10px] bg-bg-hover text-text-secondary"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 scrollable px-4 py-4 space-y-4">

          {/* Title */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary uppercase tracking-widest mb-2">
              <AlignLeft size={12} /> Title
            </label>
            <p className="text-[15px] font-semibold text-text-primary leading-snug px-4 py-3 bg-bg-card rounded-xl border border-bg-border/60">
              {task.title}
            </p>
          </div>

          {/* Description */}
          {task.description && (
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary uppercase tracking-widest mb-2">
                <AlignLeft size={12} /> Notes
              </label>
              <p className="text-sm text-text-secondary leading-relaxed px-4 py-3 bg-bg-card rounded-xl border border-bg-border/60 whitespace-pre-wrap">
                {task.description}
              </p>
            </div>
          )}

          {/* Priority + Due */}
          <div className="flex gap-2">
            <div className="flex-1 bg-bg-card rounded-xl border border-bg-border/60 px-3 py-2.5">
              <p className="text-[10px] font-semibold text-text-dim uppercase tracking-widest mb-1 flex items-center gap-1">
                <Flag size={10} /> Priority
              </p>
              <span className={cn('text-sm font-semibold', priority.color)}>{priority.label}</span>
            </div>
            {dueAt && (
              <div className="flex-1 bg-bg-card rounded-xl border border-bg-border/60 px-3 py-2.5">
                <p className="text-[10px] font-semibold text-text-dim uppercase tracking-widest mb-1 flex items-center gap-1">
                  <Calendar size={10} /> Due
                </p>
                <span className="text-sm text-text-primary">
                  {formatInTz(dueAt, viewerTz)}
                </span>
              </div>
            )}
          </div>

          {/* Status */}
          <div className="flex items-center gap-2 px-3 py-2.5 bg-bg-card rounded-xl border border-bg-border/60">
            <Clock size={13} className="text-text-dim flex-shrink-0" />
            <span className="text-xs text-text-secondary">Status</span>
            <span className={cn(
              'ml-auto text-xs font-semibold px-2.5 py-1 rounded-lg',
              task.status === 'done'        ? 'bg-emerald/15 text-emerald' :
              task.status === 'in_progress' ? 'bg-accent/15 text-accent'  :
                                              'bg-bg-hover text-text-secondary'
            )}>
              {task.status === 'todo' ? 'To Do' : task.status === 'in_progress' ? 'In Progress' : 'Done'}
            </span>
          </div>

          {/* Subtasks */}
          {subTotal > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary uppercase tracking-widest">
                  <CheckSquare size={12} /> Subtasks
                </label>
                <span className="text-[11px] text-text-dim">{subDone}/{subTotal} done</span>
              </div>

              <div className="h-[2px] bg-bg-hover rounded-full overflow-hidden mb-3">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${subPct}%`,
                    background: subPct === 100 ? '#34D399' : '#7B6EF6',
                  }}
                />
              </div>

              <div className="space-y-1.5">
                {subtasks.map(sub => (
                  <div
                    key={sub.id}
                    className="flex items-start gap-2.5 px-3 py-2.5 bg-bg-card rounded-[12px] border border-bg-border/60"
                  >
                    <button
                      onClick={() => handleToggleSubtask(sub)}
                      disabled={togglingId === sub.id}
                      className={cn(
                        'custom-checkbox flex-shrink-0 mt-0.5',
                        sub.completed ? 'checked' : 'unchecked'
                      )}
                    >
                      {sub.completed && (
                        <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                          <path d="M1 4L4 7L10 1" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <span className={cn(
                        'text-sm leading-snug block',
                        sub.completed ? 'line-through text-text-dim' : 'text-text-primary'
                      )}>
                        {sub.title}
                      </span>
                      {sub.creator && (
                        <span className="text-[10px] text-text-dim flex items-center gap-1 mt-0.5">
                          <User size={9} />
                          {sub.creator.first_name}
                          {sub.creator.username && ` · @${sub.creator.username}`}
                        </span>
                      )}
                    </div>
                    {togglingId === sub.id && (
                      <div className="w-4 h-4 border-2 border-text-dim border-t-accent rounded-full animate-spin flex-shrink-0 mt-0.5" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Edit History (accessible to viewers too) ──────── */}
          <TaskHistoryPanel taskId={task.id} userId={userId} />

        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-4 pt-3 pb-6 border-t border-bg-border/60">
          <p className="text-xs text-text-dim text-center mb-3">
            👁 View-only access · subtasks can be toggled
          </p>
          <button onClick={close} className="btn-ghost w-full py-3 text-sm">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}