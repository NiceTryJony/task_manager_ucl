'use client'

/**
 * TaskCard, MoreButton, MentionText
 *
 * Исправлено:
 * - dragAttributes: Record<string, unknown> → ReturnType<typeof useSortable>['attributes']
 *   (DraggableAttributes не имеет index-сигнатуры — отсюда и была TS-ошибка)
 * - dragListeners: аналогично, точный тип из ReturnType<typeof useSortable>
 * - dragActivatorRef: добавлен для корректной работы TouchSensor с drag-handle
 * - onPointerDown на ручке: spread listeners + override с вызовом оригинала (без `as any`)
 * - VIEWER_TZ: module-level константа, не пересчитывается на каждый рендер
 */

import { useState, useRef, memo } from 'react'
import { GripVertical, Eye, Calendar, CheckCircle2 } from 'lucide-react'
import { PRIORITY_CONFIG, cn } from '@/lib/utils'
import { TaskAssigneesBadge } from '@/components/TaskAssigneesBadge'
import { useI18n } from '@/lib/i18n-context'
import type { Task } from '@/types'
import type { useSortable } from '@dnd-kit/sortable'
import { usePriorityConfig } from '@/hooks/usePriorityConfig'

// ── Module-level constant — вычисляется один раз при загрузке бандла ──────────
// Ранее вызывался Intl.DateTimeFormat().resolvedOptions() внутри кждого рендера
// каждой карточки — фиксируем здесь.
const VIEWER_TZ = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
})()

// ── Типы из useSortable — единственный источник правды ────────────────────────
// Используем ReturnType вместо ручного импорта DraggableAttributes /
// SyntheticListenerMap, потому что:
//   1. Всегда синхронизировано с версией @dnd-kit/sortable
//   2. DraggableAttributes не имеет index-сигнатуры → несовместим с Record<string, unknown>
//   3. SyntheticListenerMap = Record<string, Function> — вызов без каста невозможен
type SortableInstance   = ReturnType<typeof useSortable>
type DragListeners      = SortableInstance['listeners']        // SyntheticListenerMap | undefined
type DragAttributes     = SortableInstance['attributes']       // DraggableAttributes
type DragActivatorRef   = SortableInstance['setActivatorNodeRef'] // (el: HTMLElement|null)=>void

// ── MentionText ───────────────────────────────────────────────────────────────

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

// ── MoreButton ────────────────────────────────────────────────────────────────

interface MoreButtonProps {
  onPress: (x: number, y: number) => void
}

export const MoreButton = memo(function MoreButton({ onPress }: MoreButtonProps) {
  const btnRef = useRef<HTMLButtonElement>(null)

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    const rect = btnRef.current?.getBoundingClientRect()
    if (!rect) return
    // Прижимаем меню к правому краю, чтобы не уходило за экран
    const x = Math.max(8, rect.right - 200)
    const y = rect.bottom + 6
    onPress(x, y)
  }

  return (
    <button
      ref={btnRef}
      onClick={handleClick}
      // Блокируем всплытие pointer/touch, чтобы не конкурировать с drag и long-press
      onPointerDownCapture={e => e.stopPropagation()}
      onTouchStartCapture={e => e.stopPropagation()}
      className={cn(
        'flex-shrink-0 self-center w-7 h-7 flex items-center justify-center rounded-lg',
        'text-text-dim hover:text-text-secondary hover:bg-bg-hover',
        'active:scale-90 transition-all duration-150',
        // Показываем только при hover/focus (desktop) — на мобильном long-press
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

// ── CardProps ─────────────────────────────────────────────────────────────────

export interface CardProps {
  task:               Task
  userId:             number
  isViewer:           boolean
  isDragMode:         boolean
  /** Карточка рендерится внутри DragOverlay — cursor grabbing, без handlers */
  isDraggingOverlay?: boolean
  /** Listeners из useSortable — кладём на drag-handle */
  dragListeners?:     DragListeners
  /** Attributes (aria-*) из useSortable — кладём на drag-handle */
  dragAttributes?:    DragAttributes
  /**
   * setActivatorNodeRef из useSortable.
   * Нужен чтобы TouchSensor знал точный DOM-узел активатора.
   * Без него тач-драг работает, но может быть менее точным.
   */
  dragActivatorRef?:  DragActivatorRef
  onToggle:           (task: Task) => void
  onOpen:             (task: Task) => void
  onLongPress:        (x: number, y: number) => void
  isSwiping?:         React.MutableRefObject<boolean>
  isUnread?:          boolean
}

// ── TaskCard ──────────────────────────────────────────────────────────────────

export const TaskCard = memo(function TaskCard({
  task, userId, isViewer, isDragMode, isDraggingOverlay,
  dragListeners, dragAttributes, dragActivatorRef,
  onToggle, onOpen, onLongPress, isSwiping, isUnread,
}: CardProps) {
  const { t } = useI18n()
  const PRIORITY_CFG = usePriorityConfig()

  const [isHolding, setIsHolding] = useState(false)
  const [burst,     setBurst]     = useState(false)

  const holdTimerRef    = useRef<ReturnType<typeof setTimeout>>()
  const longPressTimer  = useRef<ReturnType<typeof setTimeout>>()
  const didLongPress    = useRef(false)

  // const priority   = PRIORITY_CONFIG[task.priority]
  const priority = PRIORITY_CFG[task.priority]
  const isDone     = task.status === 'done'
  const isArchived = task.archived
  const subDone    = task.subtasks?.filter(s => s.completed).length ?? 0
  const subTotal   = task.subtasks?.length ?? 0
  const dueAt      = task.due_at ?? task.due_date
  const creatorTz  = task.creator_tz ?? 'UTC'

  // ── Due date labels ──────────────────────────────────────────────────────────
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

  // ── Long-press ───────────────────────────────────────────────────────────────
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
    // Если свайп активен в момент touchend — сбрасываем флаг
    if (isSwiping?.current) didLongPress.current = false
  }

  function handleClick() {
    if (!didLongPress.current) onOpen(task)
  }

  // ── Grip handle hold-indicator ───────────────────────────────────────────────

  /**
   * onPointerDown на drag-handle:
   * 1. Запускаем таймер для hold-индикатора (пульсирующий ring вокруг ручки)
   * 2. Вызываем оригинальный handler dnd-kit — иначе drag не стартует
   *
   * Мы НЕ можем просто spread listeners и ставить наш onPointerDown,
   * потому что JSX-пропсы применяются в порядке объявления и последний
   * побеждает — spread listeners был бы перезаписан. Поэтому вызываем
   * оригинал вручную.
   *
   * SyntheticListenerMap = Record<string, Function>, поэтому нужен каст
   * до конкретного типа чтобы вызвать без TS-ошибки.
   */
  function handleGripPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    holdTimerRef.current = setTimeout(() => setIsHolding(true), 50)
    // Вызываем dnd-kit handler, если есть
    if (dragListeners?.onPointerDown) {
      ;(dragListeners.onPointerDown as React.PointerEventHandler<HTMLDivElement>)(e)
    }
  }

  function handleGripPointerUp() {
    clearTimeout(holdTimerRef.current)
    setIsHolding(false)
  }

  // ── Checkbox burst animation ─────────────────────────────────────────────────
  function handleToggle() {
    if (isViewer || isDraggingOverlay) return
    if (!isDone) {
      setBurst(true)
      setTimeout(() => setBurst(false), 600)
    }
    onToggle(task)
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div
      className="card-shell group"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={isDraggingOverlay ? undefined : handleClick}
      style={{ cursor: isDraggingOverlay ? 'grabbing' : 'pointer' }}
    >

      {/* Unread dot */}
      {isUnread && !isDone && !isArchived && (
        <div
          className="absolute top-2.5 right-2.5 z-10 w-2 h-2 rounded-full pointer-events-none"
          style={{
            background: 'var(--c-accent)',
            boxShadow:  '0 0 6px rgba(129,115,245,0.8)',
          }}
        />
      )}

      <div className={cn(
        'card flex items-start overflow-hidden',
        isDone     && 'opacity-55',
        isArchived && 'opacity-40',
      )}>

        {/* Priority stripe */}
        <div
          className="w-1 self-stretch flex-shrink-0 rounded-l-2xl"
          style={{ background: priority.dot, opacity: isDone ? 0.4 : 1 }}
        />

        <div className="flex items-start gap-2.5 p-3.5 flex-1 min-w-0">

          {/* Drag handle или Eye */}
          {isDragMode || isDraggingOverlay ? (
            <div
              ref={dragActivatorRef}
              {...(dragAttributes ?? {})}
              {...(dragListeners  ?? {})}
              onPointerDown={handleGripPointerDown}
              onPointerUp={handleGripPointerUp}
              onPointerLeave={handleGripPointerUp}
              onClick={e => e.stopPropagation()}
              className={cn(
                'mt-0.5 flex-shrink-0 touch-none select-none relative transition-colors duration-150',
                isDraggingOverlay ? 'cursor-grabbing' : 'cursor-grab active:cursor-grabbing',
                isHolding ? 'text-accent' : 'text-text-dim hover:text-text-secondary',
              )}
            >
              <GripVertical size={15} />
              {isHolding && (
                <span
                  className="absolute inset-[-5px] rounded-full border border-accent/50 animate-ping pointer-events-none"
                  aria-hidden
                />
              )}
            </div>
          ) : (
            <Eye size={13} className="text-text-dim mt-1 flex-shrink-0 opacity-40" />
          )}

          {/* Чекбокс */}
          <div className="relative flex-shrink-0 mt-0.5">
            <button
              onClick={e => { e.stopPropagation(); handleToggle() }}
              className={cn(
                'custom-checkbox',
                isDone ? 'checked' : 'unchecked',
                isViewer && 'opacity-60 cursor-default',
                burst    && 'animate-checkbox-burst',
              )}
              aria-label={isDone ? 'Mark incomplete' : 'Mark complete'}
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
                      top:  '50%',
                      left: '50%',
                      animation:      'burst-particle 0.5s ease-out forwards',
                      animationDelay: `${i * 18}ms`,
                      '--angle':      `${i * 60}deg`,
                    } as React.CSSProperties}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Тело задачи — div вместо button */}
          <div className="flex-1 min-w-0 text-left">
            <p className={cn(
              'text-sm font-medium leading-snug',
              isDone && 'line-through text-text-secondary',
            )}>
              {task.title}
            </p>

            {task.description && !isDone && (
              <p className="text-xs text-text-dim mt-0.5 truncate">
                <MentionText text={task.description} />
              </p>
            )}

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
              <span className={cn(
                'text-xs px-2 py-0.5 rounded-full font-medium',
                priority.color,
                priority.bg,
              )}>
                {priority.label}
              </span>

              {dueAt && (
                <span className={cn(
                  'text-xs flex items-center gap-1',
                  dueOverdue ? 'text-danger'
                    : dueUrgent ? 'text-amber'
                    : 'text-text-secondary',
                )}>
                  <Calendar size={11} />
                  {dueLabel}
                  {dueLocalLabel && (
                    <span className="text-accent ml-0.5">· {dueLocalLabel}</span>
                  )}
                </span>
              )}

              {subTotal > 0 && (
                <span className="text-xs text-text-secondary flex items-center gap-1">
                  <CheckCircle2 size={11} />
                  {subDone}/{subTotal}
                </span>
              )}

              {isArchived && (
                <span className="text-xs text-text-dim">📦 {t('archived')}</span>
              )}
            </div>

            {(task.assignees?.length ?? 0) > 0 && (
              <div
                className="mt-2 pt-2"
                style={{ borderTop: '0.5px solid rgba(255,255,255,0.07)' }}
              >
                <TaskAssigneesBadge
                  assignees={task.assignees ?? []}
                  currentUserId={userId}
                  maxVisible={3}
                />
              </div>
            )}
          </div>

          {/* MoreButton */}
          {!isDraggingOverlay && (
            <MoreButton onPress={onLongPress} />
          )}
        </div>
      </div>
    </div>
  )
})