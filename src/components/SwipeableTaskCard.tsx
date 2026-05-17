'use client'

import { useRef, useState, useCallback } from 'react'
import { CheckCircle2, Archive } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n-context'

interface Props {
  children: React.ReactNode
  onSwipeRight: () => void   // → done
  onSwipeLeft:  () => void   // → archive
  disabled?: boolean         // drag mode active — disable swipe
}

const THRESHOLD        = 0.38  // 38% ширины для срабатывания
const VELOCITY_TRIGGER = 0.4   // px/ms — быстрый свайп
const MAX_OFFSET       = 120   // максимальный визуальный сдвиг px
const RETURN_DURATION  = '0.35s'
const FLY_DURATION     = '0.28s'

export function SwipeableTaskCard({ children, onSwipeRight, onSwipeLeft, disabled }: Props) {
  const { t } = useI18n()

  const containerRef  = useRef<HTMLDivElement>(null)
  const cardRef       = useRef<HTMLDivElement>(null)
  const startXRef     = useRef(0)
  const startTimeRef  = useRef(0)
  const currentXRef   = useRef(0)
  const trackingRef   = useRef(false)

  const [offset,     setOffset]     = useState(0)   // текущий сдвиг карточки
  const [triggered,  setTriggered]  = useState(false)
  const [direction,  setDirection]  = useState<'left' | 'right' | null>(null)
  const [flashing,   setFlashing]   = useState(false)
  const [flying,     setFlying]     = useState(false)

  // Прогресс 0→1 для насыщенности фона
  const absOffset  = Math.abs(offset)
  const progress   = Math.min(absOffset / (MAX_OFFSET * THRESHOLD * 2.5), 1)
  const isRight    = offset > 0
  const isLeft     = offset < 0
  const showHint   = absOffset > 8

  // ── Цвет подложки ─────────────────────────────────────────
  const bgOpacity  = flashing ? 1 : progress * 0.85
  const bgColor    = isRight
    ? `rgba(62, 207, 142, ${bgOpacity})`   // emerald
    : `rgba(245, 166, 35, ${bgOpacity})`   // amber

  // ── Touch handlers ─────────────────────────────────────────
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return
    trackingRef.current = true
    startXRef.current   = e.touches[0].clientX
    startTimeRef.current = Date.now()
    currentXRef.current  = 0
  }, [disabled])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!trackingRef.current || disabled) return
    const dx = e.touches[0].clientX - startXRef.current
    currentXRef.current = dx

    // Блокируем вертикальный скролл только при горизонтальном свайпе
    if (Math.abs(dx) > 8) {
      e.stopPropagation()
    }

    const clamped = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, dx))
    setOffset(clamped)
    setDirection(dx > 0 ? 'right' : 'left')

    const containerWidth = containerRef.current?.offsetWidth ?? 300
    const isTriggered = Math.abs(dx) > containerWidth * THRESHOLD
    setTriggered(isTriggered)
  }, [disabled])

  const onTouchEnd = useCallback(() => {
    if (!trackingRef.current || disabled) return
    trackingRef.current = false

    const dx        = currentXRef.current
    const dt        = Date.now() - startTimeRef.current
    const velocity  = Math.abs(dx) / dt
    const containerWidth = containerRef.current?.offsetWidth ?? 300
    const reachedThreshold = Math.abs(dx) > containerWidth * THRESHOLD
    const isFast    = velocity > VELOCITY_TRIGGER && Math.abs(dx) > 30

    if (reachedThreshold || isFast) {
      // Срабатывание — карточка улетает
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
        // Сброс после callback (если карточка осталась в DOM)
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
      // Возврат на место
      setOffset(0)
      setDirection(null)
      setTriggered(false)
    }
  }, [disabled, onSwipeRight, onSwipeLeft])

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-[23.25px]"
      style={{ touchAction: 'pan-y' }}
    >
      {/* ── Подложка (фон под карточкой) ──────────────────── */}
      {showHint && !flying && (
        <div
          className="absolute inset-0 rounded-[23.25px] flex items-center transition-all duration-75"
          style={{
            background: bgColor,
            justifyContent: isRight ? 'flex-start' : 'flex-end',
            paddingLeft:  isRight ? 20 : 0,
            paddingRight: isLeft  ? 20 : 0,
          }}
        >
          {isRight && (
            <div className={cn(
              'flex items-center gap-1.5 transition-all duration-150',
              triggered ? 'scale-110' : 'scale-100'
            )}>
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
            <div className={cn(
              'flex items-center gap-1.5 transition-all duration-150',
              triggered ? 'scale-110' : 'scale-100'
            )}>
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

      {/* ── Карточка ──────────────────────────────────────── */}
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
}