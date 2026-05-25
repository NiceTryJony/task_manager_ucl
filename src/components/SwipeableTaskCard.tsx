'use client'

import { useRef, useState, useCallback, memo } from 'react'
import { CheckCircle2, Archive, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n-context'

interface Props {
  children:          React.ReactNode
  onSwipeRight:      () => void
  onSwipeLeft:       () => void
  onSwipeLeftDeep?:  () => void   // deep swipe → delete (with confirmation in parent)
  onSwipeStart?:     () => void
  onSwipeEnd?:       () => void
  disabled?:         boolean
  isDraggingGlobal?: boolean
}

const THRESHOLD        = 0.38   // archive zone
const THRESHOLD_DELETE = 0.65   // delete zone (deeper left swipe)
const VELOCITY_TRIGGER = 0.4
const MAX_OFFSET       = 150    // slightly larger to show delete zone
const RETURN_DURATION  = '0.35s'
const FLY_DURATION     = '0.28s'

export const SwipeableTaskCard = memo(function SwipeableTaskCard({
  children,
  onSwipeRight,
  onSwipeLeft,
  onSwipeLeftDeep,
  disabled,
  onSwipeStart,
  onSwipeEnd,
  isDraggingGlobal,
}: Props) {
  const { t } = useI18n()

  const containerRef = useRef<HTMLDivElement>(null)
  const cardRef      = useRef<HTMLDivElement>(null)
  const startXRef    = useRef(0)
  const startTimeRef = useRef(0)
  const currentXRef  = useRef(0)
  const trackingRef  = useRef(false)

  const [offset,       setOffset]       = useState(0)
  const [triggered,    setTriggered]    = useState(false)   // archive zone
  const [inDeleteZone, setInDeleteZone] = useState(false)   // delete zone
  const [direction,    setDirection]    = useState<'left' | 'right' | null>(null)
  const [flashing,     setFlashing]     = useState(false)
  const [flying,       setFlying]       = useState(false)

  const absOffset = Math.abs(offset)
  const progress  = Math.min(absOffset / (MAX_OFFSET * THRESHOLD * 2.5), 1)
  const isRight   = offset > 0
  const isLeft    = offset < 0
  const showHint  = absOffset > 8

  // Colour: green for done, red for delete zone, amber for archive
  const bgOpacity = flashing ? 1 : progress * 0.85
  const bgColor   = isRight
    ? `rgba(62, 207, 142, ${bgOpacity})`
    : inDeleteZone
      ? `rgba(240, 112, 112, ${bgOpacity})`      // red delete zone
      : `rgba(245, 166, 35, ${bgOpacity})`        // amber archive zone

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

    const clamped        = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, dx))
    const containerWidth = containerRef.current?.offsetWidth ?? 300
    const absDx          = Math.abs(dx)

    setOffset(clamped)
    setDirection(dx > 0 ? 'right' : 'left')

    // Delete zone only applies to left swipe and only if handler provided
    const isInDeleteZone = (
      dx < 0 &&
      !!onSwipeLeftDeep &&
      absDx > containerWidth * THRESHOLD_DELETE
    )
    const isInArchiveZone = (
      dx < 0 &&
      absDx > containerWidth * THRESHOLD &&
      !isInDeleteZone
    )

    setInDeleteZone(isInDeleteZone)
    setTriggered(isInArchiveZone || (dx > 0 && absDx > containerWidth * THRESHOLD))
  }, [disabled, onSwipeStart, onSwipeLeftDeep])

  const onTouchEnd = useCallback(() => {
    if (!trackingRef.current || disabled) return
    onSwipeEnd?.()
    trackingRef.current = false

    const dx             = currentXRef.current
    const dt             = Date.now() - startTimeRef.current
    const velocity       = Math.abs(dx) / dt
    const containerWidth = containerRef.current?.offsetWidth ?? 300
    const absDx          = Math.abs(dx)

    // ── Delete zone (deep left swipe) ────────────────────────
    // Snap back → parent shows confirmation → if yes, removes from list
    if (dx < 0 && !!onSwipeLeftDeep && absDx > containerWidth * THRESHOLD_DELETE) {
      setOffset(0)
      setDirection(null)
      setTriggered(false)
      setInDeleteZone(false)
      onSwipeLeftDeep()
      return
    }

    // ── Normal archive / done swipe ──────────────────────────
    const reachedThreshold = absDx > containerWidth * THRESHOLD
    const isFast           = velocity > VELOCITY_TRIGGER && absDx > 30

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
          setOffset(0); setDirection(null); setTriggered(false)
          setInDeleteZone(false); setFlying(false)
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
      setInDeleteZone(false)
    }
  }, [disabled, onSwipeRight, onSwipeLeft, onSwipeLeftDeep, onSwipeEnd])

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

          {isLeft && !inDeleteZone && (
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

          {/* Delete zone — only shows on deep left swipe */}
          {isLeft && inDeleteZone && (
            <div className="flex items-center gap-1.5 scale-110">
              <span className="text-white text-xs font-bold tracking-wide">
                {t('delete')}
              </span>
              <Trash2
                size={22}
                className="text-white"
                strokeWidth={2.5}
              />
            </div>
          )}
        </div>
      )}

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