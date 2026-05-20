'use client'

import { useState, useRef, memo } from 'react'
import { GripVertical, Eye, Calendar, CheckCircle2 } from 'lucide-react'
import { PRIORITY_CONFIG, cn } from '@/lib/utils'
import type { Task } from '@/types'
import { TaskAssigneesBadge } from '@/components/TaskAssigneesBadge'
import { useI18n } from '@/lib/i18n-context'

// Вычисляется один раз при загрузке модуля — не на каждый рендер карточки.
// Это исправляет замечание из code review: Intl.DateTimeFormat() в каждом TaskCard.
const VIEWER_TZ = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return 'UTC' }
})()

// ── MentionText ───────────────────────────────────────────────

export const MentionText = memo(function MentionText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(@[a-zA-Z0-9_]+)/g).map((part, i) =>
        /^@[a-zA-Z0-9_]+$/.test(part)
          ? <span key={i} className="text-accent font-medium">{part}</span>
          : <span key={i}>{part}</span>
      )}
    </>
  )
})

// ── MoreButton ────────────────────────────────────────────────

export const MoreButton = memo(function MoreButton({
  onPress,
}: {
  onPress: (x: number, y: number) => void
}) {
  const btnRef = useRef<HTMLButtonElement>(null)

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    const rect = btnRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = Math.max(8, rect.right - 200)
    const y = rect.bottom + 6
    onPress(x, y)
  }

  return (
    <button
      ref={btnRef}
      onClick={handleClick}
      onPointerDownCapture={e => e.stopPropagation()}
      onTouchStartCapture={e => e.stopPropagation()}
      className={cn(
        'flex-shrink-0 self-center w-7 h-7 flex items-center justify-center rounded-lg',
        'text-text-dim hover:text-text-secondary hover:bg-bg-hover',
        'active:scale-90 transition-all duration-150',
        'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
      )}
      aria-label="Task options"
    >
      <svg width="3" height="15" viewBox="0 0 3 15" fill="currentColor">
        <circle cx="1.5" cy="1.5"  r="1.5" />
        <circle cx="1.5" cy="7.5"  r="1.5" />
        <circle cx="1.5" cy="13.5" r="1.5" />
      </svg>
    </button>
  )
})

// ── CardProps ─────────────────────────────────────────────────

export interface CardProps {
  task:               Task
  userId:             number
  isViewer:           boolean
  isDragMode:         boolean
  isDraggingOverlay?: boolean
  dragListeners?:     Record<string, Function>
  dragAttributes?:    Record<string, unknown>
  onToggle:           (task: Task) => void
  onOpen:             (task: Task) => void
  onLongPress:        (x: number, y: number) => void
  isSwiping?:         React.MutableRefObject<boolean>
  isUnread?:          boolean
}

// ── TaskCard ──────────────────────────────────────────────────

export const TaskCard = memo(function TaskCard({
  task, userId, isViewer, isDragMode, isDraggingOverlay,
  dragListeners, dragAttributes,
  onToggle, onOpen, onLongPress, isSwiping, isUnread,
}: CardProps) {
  const { t } = useI18n()

  const [isHolding, setIsHolding] = useState(false)
  const [burst,     setBurst]     = useState(false)

  const holdTimer      = useRef<ReturnType<typeof setTimeout>>()
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>()
  const didLongPress   = useRef(false)

  const priority   = PRIORITY_CONFIG[task.priority]
  const isDone     = task.status === 'done'
  const isArchived = task.archived
  const subDone    = task.subtasks?.filter(s => s.completed).length ?? 0
  const subTotal   = task.subtasks?.length ?? 0
  const dueAt      = task.due_at ?? task.due_date
  const creatorTz  = task.creator_tz ?? 'UTC'

  // ── Due date labels ──────────────────────────────────────────
  let dueLabel = '', dueUrgent = false, dueOverdue = false, dueLocalLabel = ''
  if (dueAt) {
    const d    = new Date(dueAt)
    const now  = new Date()
    const diff = Math.round((d.getTime() - now.getTime()) / 86_400_000)
    dueOverdue = diff < 0
    dueUrgent  = diff <= 1
    dueLabel   = dueOverdue
      ? `${Math.abs(diff)}${t('dOverdue')}`
      : diff === 0 ? t('today')
      : diff === 1 ? t('tomorrow')
      : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: creatorTz })
    if (creatorTz !== VIEWER_TZ) {
      dueLocalLabel = d.toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', timeZone: VIEWER_TZ,
      })
    }
  }

  // ── Handlers ─────────────────────────────────────────────────

  function handleTouchStart(e: React.TouchEvent) {
    if (isDraggingOverlay) return
    didLongPress.current = false
    const { clientX, clientY } = e.touches[0]
    longPressTimer.current = setTimeout(() => {
      if (isSwiping?.current) return
      didLongPress.current = true
      onLongPress(clientX, clientY)
    }, 500)
  }

  function handleTouchEnd() {
    clearTimeout(longPressTimer.current)
    if (isSwiping?.current) didLongPress.current = false
  }

  function handleClick() {
    if (!didLongPress.current) onOpen(task)
  }

  function handleGripPointerDown(e: React.PointerEvent) {
    holdTimer.current = setTimeout(() => setIsHolding(true), 50)
    dragListeners?.onPointerDown?.(e)
  }

  function handleGripPointerUp() {
    clearTimeout(holdTimer.current)
    setIsHolding(false)
  }

  function handleToggle() {
    if (isViewer || isDraggingOverlay) return
    if (!isDone) { setBurst(true); setTimeout(() => setBurst(false), 600) }
    onToggle(task)
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="card-shell group">

      {/* Unread dot */}
      {isUnread && !isDone && !isArchived && (
        <div
          className="absolute top-2.5 right-2.5 z-10 w-2 h-2 rounded-full pointer-events-none"
          style={{ background: 'var(--c-accent)', boxShadow: '0 0 6px rgba(129,115,245,0.8)' }}
        />
      )}

      <div className={cn('card flex items-start overflow-hidden', isDone && 'opacity-55', isArchived && 'opacity-40')}>

        {/* Priority stripe */}
        <div
          className="w-1 self-stretch flex-shrink-0 rounded-l-2xl"
          style={{ background: priority.dot, opacity: isDone ? 0.4 : 1 }}
        />

        <div className="flex items-start gap-2.5 p-3.5 flex-1 min-w-0">

          {/* Drag handle or viewer indicator */}
          {isDragMode || isDraggingOverlay ? (
            <div
              {...dragAttributes}
              onPointerDown={handleGripPointerDown}
              onPointerUp={handleGripPointerUp}
              onPointerLeave={handleGripPointerUp}
              onTouchStart={dragListeners?.onTouchStart as React.TouchEventHandler}
              onTouchMove={dragListeners?.onTouchMove as React.TouchEventHandler}
              onTouchEnd={dragListeners?.onTouchEnd as React.TouchEventHandler}
              className={cn(
                'mt-0.5 flex-shrink-0 touch-none select-none relative transition-colors duration-150',
                isDraggingOverlay ? 'cursor-grabbing' : 'cursor-grab active:cursor-grabbing',
                isHolding ? 'text-accent' : 'text-text-dim hover:text-text-secondary',
              )}
            >
              <GripVertical size={15} />
              {isHolding && (
                <span className="absolute inset-[-5px] rounded-full border border-accent/50 animate-ping pointer-events-none" />
              )}
            </div>
          ) : (
            <Eye size={13} className="text-text-dim mt-1 flex-shrink-0 opacity-40" />
          )}

          {/* Checkbox */}
          <div className="relative flex-shrink-0 mt-0.5">
            <button
              onClick={handleToggle}
              className={cn(
                'custom-checkbox',
                isDone ? 'checked' : 'unchecked',
                isViewer && 'opacity-60 cursor-default',
                burst && 'animate-checkbox-burst',
              )}
            >
              {isDone && (
                <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                  <path d="M1 4L4 7L10 1" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>

            {burst && (
              <div className="absolute inset-0 pointer-events-none" aria-hidden>
                {[...Array(6)].map((_, i) => (
                  <span
                    key={i}
                    className="absolute w-1 h-1 rounded-full bg-emerald"
                    style={{
                      top: '50%', left: '50%',
                      animation:      'burst-particle 0.5s ease-out forwards',
                      animationDelay: `${i * 18}ms`,
                      '--angle':      `${i * 60}deg`,
                    } as React.CSSProperties}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Task body */}
          <button
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onClick={isDraggingOverlay ? undefined : handleClick}
            className="flex-1 min-w-0 text-left"
          >
            <p className={cn('text-sm font-medium leading-snug', isDone && 'line-through text-text-secondary')}>
              {task.title}
            </p>

            {task.description && !isDone && (
              <p className="text-xs text-text-dim mt-0.5 truncate">
                <MentionText text={task.description} />
              </p>
            )}

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
              <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', priority.color, priority.bg)}>
                {priority.label}
              </span>

              {dueAt && (
                <span className={cn(
                  'text-xs flex items-center gap-1',
                  dueOverdue ? 'text-danger' : dueUrgent ? 'text-amber' : 'text-text-secondary',
                )}>
                  <Calendar size={11} />
                  {dueLabel}
                  {dueLocalLabel && <span className="text-accent ml-0.5">· {dueLocalLabel}</span>}
                </span>
              )}

              {subTotal > 0 && (
                <span className="text-xs text-text-secondary flex items-center gap-1">
                  <CheckCircle2 size={11} />{subDone}/{subTotal}
                </span>
              )}

              {isArchived && (
                <span className="text-xs text-text-dim">📦 {t('archived')}</span>
              )}
            </div>

            {(task.assignees?.length ?? 0) > 0 && (
              <div className="mt-2 pt-2" style={{ borderTop: '0.5px solid rgba(255,255,255,0.07)' }}>
                <TaskAssigneesBadge
                  assignees={task.assignees ?? []}
                  currentUserId={userId}
                  maxVisible={3}
                />
              </div>
            )}
          </button>

          {!isDraggingOverlay && (
            <MoreButton onPress={onLongPress} />
          )}
        </div>
      </div>
    </div>
  )
})