'use client'

import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { X, Calendar, Flag, AlignLeft, CheckSquare, Clock, User } from 'lucide-react'
import { PRIORITY_CONFIG, cn } from '@/lib/utils'
import type { Task, Subtask } from '@/types'
import { TaskHistoryPanel } from '@/components/TaskHistoryPanel'
import { useI18n } from '@/lib/i18n-context'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api-client'
import { TaskViewers } from '@/components/TaskViewers'

interface Props {
  task:              Task
  userId:            number
  onClose:           () => void
  onSubtaskToggled?: () => void
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
  const { t } = useI18n()
  const [subtasks,   setSubtasks]   = useState<Subtask[]>(task.subtasks ?? [])
  const [togglingId, setTogglingId] = useState<string | null>(null)

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

  async function handleToggleSubtask(sub: Subtask) {
    setTogglingId(sub.id)
    const next = !sub.completed
    setSubtasks(prev => prev.map(s => s.id === sub.id ? { ...s, completed: next } : s))
    const res  = await apiFetch('/api/tasks/subtasks', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subtaskId: sub.id, userId, completed: next }),
    })
    const data = await res.json()
    if (!res.ok) {
      toast.error(data.error ?? t('failedToSave'))
      setSubtasks(prev => prev.map(s => s.id === sub.id ? { ...s, completed: sub.completed } : s))
    } else {
      onSubtaskToggled?.()
    }
    setTogglingId(null)
  }

  function statusLabel(s: string) {
    if (s === 'todo') return t('todo')
    if (s === 'in_progress') return t('inProgress')
    return t('done')
  }

  // Reusable glass info block style
  const infoBlock: React.CSSProperties = {
    background:   'rgba(255,255,255,0.04)',
    border:       '0.5px solid rgba(255,255,255,0.08)',
    boxShadow:    'inset 0 1px 0 rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding:      '10px 14px',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div ref={overlayRef} className="absolute inset-0 sheet-overlay" onClick={close} />

      <div
        ref={sheetRef}
        className="relative w-full max-h-[92dvh] flex flex-col"
        style={{
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
        {/* <div className="flex justify-center pt-3 pb-0 flex-shrink-0">
          <div className="w-9 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.12)' }} />
        </div> */}

        {/* Header */}
        <div
          className="flex-shrink-0 flex items-center justify-between px-4 pt-4 pb-3"
          style={{ borderBottom: '0.5px solid rgba(255,255,255,0.07)' }}
        >
          <div className="flex items-center gap-2.5">
            <h2 className="text-[17px] font-bold text-text-primary">{t('viewTask')}</h2>
            <span
              className="text-[11px] font-semibold px-2 py-0.5 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.07)', color: 'var(--text-secondary)' }}
            >
              {t('readOnly')}
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

        <div className="flex-1 scrollable px-4 py-4 space-y-4">

          {/* Title */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary uppercase tracking-widest mb-2">
              <AlignLeft size={12} /> {t('taskTitle')}
            </label>
            <p
              className="text-[15px] font-semibold text-text-primary leading-snug px-4 py-3"
              style={infoBlock}
            >
              {task.title}
            </p>
          </div>

          {/* Description */}
          {task.description && (
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary uppercase tracking-widest mb-2">
                <AlignLeft size={12} /> {t('notes')}
              </label>
              <p
                className="text-sm text-text-secondary leading-relaxed px-4 py-3 whitespace-pre-wrap"
                style={infoBlock}
              >
                {task.description}
              </p>
            </div>
          )}

          {/* Priority + Due */}
          <div className="flex gap-2">
            <div className="flex-1" style={infoBlock}>
              <p className="text-[10px] font-semibold text-text-dim uppercase tracking-widest mb-1 flex items-center gap-1">
                <Flag size={10} /> {t('priority')}
              </p>
              <span className={cn('text-sm font-semibold', priority.color)}>{priority.label}</span>
            </div>
            {dueAt && (
              <div className="flex-1" style={infoBlock}>
                <p className="text-[10px] font-semibold text-text-dim uppercase tracking-widest mb-1 flex items-center gap-1">
                  <Calendar size={10} /> {t('dueLabel')}
                </p>
                <span className="text-sm text-text-primary">
                  {formatInTz(dueAt, viewerTz)}
                </span>
              </div>
            )}
          </div>

          {/* Status */}
          <div className="flex items-center gap-2 px-3 py-2.5" style={infoBlock}>
            <Clock size={13} className="text-text-dim flex-shrink-0" />
            <span className="text-xs text-text-secondary">{t('statusLabel')}</span>
            <span
              className="ml-auto text-xs font-semibold px-2.5 py-1 rounded-lg"
              style={
                task.status === 'done'        ? { background: 'rgba(62,207,142,0.12)',   color: 'var(--c-emerald)' } :
                task.status === 'in_progress' ? { background: 'rgba(129,115,245,0.12)',  color: 'var(--c-accent)'  } :
                                                { background: 'rgba(255,255,255,0.07)',  color: 'var(--text-secondary)' }
              }
            >
              {statusLabel(task.status)}
            </span>
          </div>

          {/* Subtasks */}
          {subTotal > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary uppercase tracking-widest">
                  <CheckSquare size={12} /> {t('subtasks')}
                </label>
                <span className="text-[11px] text-text-dim">{subDone}/{subTotal} {t('subtasksDone')}</span>
              </div>

              {/* Progress bar */}
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

              <div className="space-y-1.5">
                {subtasks.map(sub => (
                  <div
                    key={sub.id}
                    className="flex items-start gap-2.5 px-3 py-2.5"
                    style={{
                      background:   'rgba(255,255,255,0.04)',
                      border:       '0.5px solid rgba(255,255,255,0.07)',
                      boxShadow:    'inset 0 1px 0 rgba(255,255,255,0.04)',
                      borderRadius: 14,
                    }}
                  >
                    <button
                      onClick={() => { if (togglingId !== sub.id) handleToggleSubtask(sub) }}
                      className={cn(
                        'custom-checkbox flex-shrink-0 mt-0.5',
                        sub.completed ? 'checked' : 'unchecked',
                        togglingId === sub.id && 'opacity-60',
                      )}
                    >
                      {sub.completed && (
                        <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                          <path d="M1 4L4 7L10 1" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <span className={cn('text-sm leading-snug block', sub.completed ? 'line-through text-text-dim' : 'text-text-primary')}>
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
                    {/* {togglingId === sub.id && (
                      <div
                        className="w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5"
                        style={{ borderColor: 'rgba(255,255,255,0.15)', borderTopColor: 'var(--c-accent)', animation: 'spin 0.7s linear infinite' }}
                      />
                    )} */}
                  </div>
                ))}
              </div>
            </div>
          )}

          <TaskViewers taskId={task.id} userId={userId} />

          <TaskHistoryPanel taskId={task.id} userId={userId} />
        </div>

        {/* Footer */}
        <div
          className="flex-shrink-0 px-4 pt-3 pb-6"
          style={{ borderTop: '0.5px solid rgba(255,255,255,0.07)' }}
        >
          <p className="text-xs text-text-dim text-center mb-3">{t('viewOnlyHint')}</p>
          <button
            onClick={close}
            className="w-full py-3 text-sm font-medium text-text-secondary rounded-xl transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.09)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.09)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)' }}
          >
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  )
}