'use client'

import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import {
  X, Calendar, Flag, AlignLeft, CheckSquare,
  Clock, History, ChevronDown, ChevronUp, User,
} from 'lucide-react'
import { PRIORITY_CONFIG, cn } from '@/lib/utils'
import type { Task, TaskHistory, Subtask } from '@/types'
import { toast } from 'sonner'

interface Props {
  task:    Task
  userId:  number
  onClose: () => void
  onSubtaskToggled?: () => void
}

const FIELD_LABELS: Record<string, string> = {
  title:       'Title',
  description: 'Notes',
  priority:    'Priority',
  status:      'Status',
  due_at:      'Due date',
  archived:    'Archived',
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

function timeAgo(isoStr: string) {
  const diff = Date.now() - new Date(isoStr).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(mins / 60)
  const days  = Math.floor(hours / 24)
  if (mins  < 1)   return 'just now'
  if (mins  < 60)  return `${mins}m ago`
  if (hours < 24)  return `${hours}h ago`
  if (days  < 7)   return `${days}d ago`
  return new Date(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function ViewerTaskSheet({ task, userId, onClose, onSubtaskToggled }: Props) {
  const [subtasks,     setSubtasks]     = useState<Subtask[]>(task.subtasks ?? [])
  const [history,      setHistory]      = useState<TaskHistory[]>([])
  const [showHistory,  setShowHistory]  = useState(false)
  const [loadingHist,  setLoadingHist]  = useState(false)
  const [togglingId,   setTogglingId]   = useState<string | null>(null)

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

  // ── Subtask toggle (viewer CAN do this) ───────────────────
  async function handleToggleSubtask(sub: Subtask) {
    setTogglingId(sub.id)
    const next = !sub.completed
    setSubtasks(prev => prev.map(s => s.id === sub.id ? { ...s, completed: next } : s))
    const res = await fetch('/api/tasks/subtasks', {
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

  // ── History ────────────────────────────────────────────────
  async function handleLoadHistory() {
    if (showHistory) { setShowHistory(false); return }
    if (history.length) { setShowHistory(true); return }
    setLoadingHist(true)
    try {
      const res  = await fetch(`/api/tasks/history?taskId=${task.id}&userId=${userId}`)
      const data = await res.json()
      setHistory(data.history ?? [])
    } catch {}
    setLoadingHist(false)
    setShowHistory(true)
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

              {/* Progress bar */}
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
                    {/* Checkbox — viewer CAN toggle */}
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
                      {/* Creator */}
                      {sub.creator && (
                        <span className="text-[10px] text-text-dim flex items-center gap-1 mt-0.5">
                          <User size={9} />
                          {sub.creator.first_name}
                          {sub.creator.username && ` · @${sub.creator.username}`}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Edit History */}
          <div>
            <button
              onClick={handleLoadHistory}
              className="w-full flex items-center justify-between px-3 py-2.5 bg-bg-card rounded-xl border border-bg-border/60 text-sm text-text-secondary hover:bg-bg-hover transition-colors"
            >
              <span className="flex items-center gap-2">
                <History size={14} />
                Edit History
                {history.length > 0 && (
                  <span className="text-xs bg-bg-hover px-1.5 py-0.5 rounded-full">{history.length}</span>
                )}
              </span>
              {loadingHist
                ? <div className="w-3 h-3 border-2 border-text-dim border-t-accent rounded-full animate-spin" />
                : showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />
              }
            </button>

            {showHistory && (
              <div className="mt-2 space-y-1.5">
                {history.length === 0 ? (
                  <p className="text-xs text-text-dim text-center py-3">No changes recorded yet</p>
                ) : (
                  history.map(h => (
                    <div key={h.id} className="px-3 py-2.5 bg-bg-card rounded-xl border border-bg-border/60">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-accent/20 text-accent flex items-center justify-center text-[9px] font-bold flex-shrink-0">
                            {h.user.first_name[0]?.toUpperCase()}
                          </span>
                          {h.user.first_name}
                          {h.user.username && (
                            <span className="text-text-dim font-normal">@{h.user.username}</span>
                          )}
                        </span>
                        <span className="text-[10px] text-text-dim">{timeAgo(h.created_at)}</span>
                      </div>
                      <div className="text-xs text-text-secondary pl-7">
                        Changed <span className="text-text-primary font-medium">{FIELD_LABELS[h.field] ?? h.field}</span>
                        {h.old_value != null && h.new_value != null && (
                          <span className="text-text-dim">
                            {' '}from{' '}
                            <span className="line-through text-danger/70">{h.old_value === 'null' ? 'none' : h.old_value}</span>
                            {' '}to{' '}
                            <span className="text-emerald">{h.new_value === 'null' ? 'none' : h.new_value}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-4 pt-3 pb-6 border-t border-bg-border/60">
          <p className="text-xs text-text-dim text-center mb-3">
            👁 You have view-only access · subtasks can be toggled
          </p>
          <button onClick={close} className="btn-ghost w-full py-3 text-sm">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}