'use client'

import { useRef, useState, useCallback, memo } from 'react'
import { CheckCircle2, Archive } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n-context'

interface Props {
  children:        React.ReactNode
  onSwipeRight:    () => void
  onSwipeLeft:     () => void
  onSwipeStart?:   () => void
  onSwipeEnd?:     () => void
  disabled?:       boolean
  isDraggingGlobal?: boolean
}

const THRESHOLD        = 0.38
const VELOCITY_TRIGGER = 0.4
const MAX_OFFSET       = 120
const RETURN_DURATION  = '0.35s'
const FLY_DURATION     = '0.28s'

// React.memo — prevents re-render when parent ListDetailView state changes
// (isPulling, showSearch, contextMenu, etc.) as long as the task itself
// and the swipe callbacks haven't changed.
//
// The parent already wraps onSwipeRight/onSwipeLeft in stable closures
// (they close over `task` which is a stable list item reference from the store).
// onSwipeStart / onSwipeEnd come from isSwipingRef mutations — those are
// already stable arrow functions defined inline in ListDetailView.
export const SwipeableTaskCard = memo(function SwipeableTaskCard({
  children,
  onSwipeRight,
  onSwipeLeft,
  disabled,
  onSwipeStart,
  onSwipeEnd,
  isDraggingGlobal,
}: Props) {
  const { t } = useI18n()

  const containerRef  = useRef<HTMLDivElement>(null)
  const cardRef       = useRef<HTMLDivElement>(null)
  const startXRef     = useRef(0)
  const startTimeRef  = useRef(0)
  const currentXRef   = useRef(0)
  const trackingRef   = useRef(false)

  const [offset,    setOffset]    = useState(0)
  const [triggered, setTriggered] = useState(false)
  const [direction, setDirection] = useState<'left' | 'right' | null>(null)
  const [flashing,  setFlashing]  = useState(false)
  const [flying,    setFlying]    = useState(false)

  const absOffset = Math.abs(offset)
  const progress  = Math.min(absOffset / (MAX_OFFSET * THRESHOLD * 2.5), 1)
  const isRight   = offset > 0
  const isLeft    = offset < 0
  const showHint  = absOffset > 8

  const bgOpacity = flashing ? 1 : progress * 0.85
  const bgColor   = isRight
    ? `rgba(62, 207, 142, ${bgOpacity})`
    : `rgba(245, 166, 35, ${bgOpacity})`

  // All touch handlers wrapped in useCallback so the functions are stable
  // across parent re-renders (memo comparison would fail otherwise since
  // every render would create new inline arrow functions).

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return
    trackingRef.current  = true
    startXRef.current    = e.touches[0].clientX
    startTimeRef.current = Date.now()
    currentXRef.current  = 0
  }, [disabled])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!trackingRef.current || disabled) return
    const dx = e.touches[0].clientX - startXRef.current
    currentXRef.current = dx

    if (Math.abs(dx) > 8) {
      e.stopPropagation()
      onSwipeStart?.()
    }

    const clamped = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, dx))
    setOffset(clamped)
    setDirection(dx > 0 ? 'right' : 'left')

    const containerWidth   = containerRef.current?.offsetWidth ?? 300
    const isTriggeredLocal = Math.abs(dx) > containerWidth * THRESHOLD
    setTriggered(isTriggeredLocal)
  }, [disabled, onSwipeStart])

  const onTouchEnd = useCallback(() => {
    if (!trackingRef.current || disabled) return
    onSwipeEnd?.()
    trackingRef.current = false

    const dx             = currentXRef.current
    const dt             = Date.now() - startTimeRef.current
    const velocity       = Math.abs(dx) / dt
    const containerWidth = containerRef.current?.offsetWidth ?? 300
    const reachedThreshold = Math.abs(dx) > containerWidth * THRESHOLD
    const isFast           = velocity > VELOCITY_TRIGGER && Math.abs(dx) > 30

    if (reachedThreshold || isFast) {
      setFlashing(true)
      setFlying(true)

      const flyTo = dx > 0 ? '110%' : '-110%'
      if (cardRef.current) {
        cardRef.current.style.transition = `transform ${FLY_DURATION} cubic-bezier(0.4,0,0.2,1), opacity ${FLY_DURATION} ease`
        cardRef.current.style.transform  = `translateX(${flyTo})`
        cardRef.current.style.opacity    = '0'
      }

      setTimeout(() => {
        setFlashing(false)
        dx > 0 ? onSwipeRight() : onSwipeLeft()
        setTimeout(() => {
          setOffset(0); setDirection(null); setTriggered(false); setFlying(false)
          if (cardRef.current) {
            cardRef.current.style.transition = ''
            cardRef.current.style.transform  = ''
            cardRef.current.style.opacity    = ''
          }
        }, 100)
      }, 240)

    } else {
      setOffset(0)
      setDirection(null)
      setTriggered(false)
    }
  }, [disabled, onSwipeRight, onSwipeLeft, onSwipeEnd])

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative rounded-[23.25px]',
        !isDraggingGlobal && 'overflow-hidden',
      )}
      style={{ touchAction: 'pan-y' }}
    >
      {/* Background hint */}
      {showHint && !flying && !isDraggingGlobal && (
        <div
          className="absolute inset-0 rounded-[23.25px] flex items-center transition-all duration-75"
          style={{
            background:     bgColor,
            justifyContent: isRight ? 'flex-start' : 'flex-end',
            paddingLeft:    isRight ? 20 : 0,
            paddingRight:   isLeft  ? 20 : 0,
          }}
        >
          {isRight && (
            <div className={cn('flex items-center gap-1.5 transition-all duration-150', triggered ? 'scale-110' : 'scale-100')}>
              <CheckCircle2
                size={triggered ? 22 : 18}
                className="text-white transition-all duration-150"
                strokeWidth={triggered ? 2.5 : 2}
              />
              <span className="text-white text-xs font-bold tracking-wide">
                {t('swipeDone')}
              </span>
            </div>
          )}
          {isLeft && (
            <div className={cn('flex items-center gap-1.5 transition-all duration-150', triggered ? 'scale-110' : 'scale-100')}>
              <span className="text-white text-xs font-bold tracking-wide">
                {t('swipeArchive')}
              </span>
              <Archive
                size={triggered ? 22 : 18}
                className="text-white transition-all duration-150"
                strokeWidth={triggered ? 2.5 : 2}
              />
            </div>
          )}
        </div>
      )}

      {/* Card */}
      <div
        ref={cardRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform:  `translateX(${offset}px)`,
          transition: offset === 0 && !flying
            ? `transform ${RETURN_DURATION} cubic-bezier(0.34,1.56,0.64,1)`
            : 'none',
          willChange: 'transform',
        }}
      >
        {children}
      </div>
    </div>
  )
})