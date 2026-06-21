'use client'

import { useRef, useState, useCallback, useEffect, memo } from 'react'
import { CheckCircle2, Archive, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n-context'

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  children:          React.ReactNode
  onSwipeRight:      () => void
  onSwipeLeft:       () => void
  onSwipeLeftDeep?:  () => void   // deep left swipe → delete
  onSwipeStart?:     () => void
  onSwipeEnd?:       () => void
  disabled?:         boolean
  isDraggingGlobal?: boolean
}

// ── Constants ─────────────────────────────────────────────────────────────────

// Все пороги — относительно MAX_OFFSET, а не containerWidth.
// Ранее THRESHOLD_DELETE был 0.65 * containerWidth (≈253px) при MAX_OFFSET=150 →
// delete zone была физически недостижима. Теперь всё в пределах MAX_OFFSET.
const MAX_OFFSET       = 150    // максимальный сдвиг карточки в px
const ARCHIVE_RATIO    = 0.38   // 57px  — архив/done
const DELETE_RATIO     = 0.70   // 105px — удаление (достижимо, но требует усилия)
const VELOCITY_TRIGGER = 0.4    // px/ms — быстрый свайп засчитывается без порога
const MIN_SWIPE_PX     = 30     // минимальный dx для засчёта по velocity

const ARCHIVE_PX = MAX_OFFSET * ARCHIVE_RATIO  // 57px
const DELETE_PX  = MAX_OFFSET * DELETE_RATIO   // 105px

const RETURN_DURATION = '0.35s'
const FLY_DURATION    = '0.26s'

// ── Swipe state ───────────────────────────────────────────────────────────────

type Zone = 'none' | 'right' | 'archive' | 'delete'

interface SwipeState {
  offset:    number
  zone:      Zone
  flying:    boolean
  flashing:  boolean
}

const INITIAL: SwipeState = { offset: 0, zone: 'none', flying: false, flashing: false }

// ── Component ─────────────────────────────────────────────────────────────────

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

  // ── DOM refs ───────────────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null)
  const cardRef      = useRef<HTMLDivElement>(null)

  // ── Gesture tracking refs (не вызывают ре-рендер) ─────────────────────────
  const startXRef      = useRef(0)
  const startTimeRef   = useRef(0)
  const currentDxRef   = useRef(0)
  const trackingRef    = useRef(false)
  const didNotifyStart = useRef(false)  // onSwipeStart уведомляем только один раз

  // ── Timeout ref для очистки при unmount ───────────────────────────────────
  const flyTimerRef    = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const resetTimerRef  = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // ── Единый state вместо 6 useState ────────────────────────────────────────
  const [sw, setSw] = useState<SwipeState>(INITIAL)

  // Очищаем таймеры при unmount — предотвращаем setState на unmounted компоненте
  useEffect(() => () => {
    clearTimeout(flyTimerRef.current)
    clearTimeout(resetTimerRef.current)
  }, [])

  // ── Стабильный ref для коллбэков (не ломает useCallback deps) ─────────────
  const cbRef = useRef({ onSwipeRight, onSwipeLeft, onSwipeLeftDeep, onSwipeStart, onSwipeEnd })
  useEffect(() => {
    cbRef.current = { onSwipeRight, onSwipeLeft, onSwipeLeftDeep, onSwipeStart, onSwipeEnd }
  })

  // ── Сброс в исходное состояние ────────────────────────────────────────────
  const resetCard = useCallback(() => {
    setSw(INITIAL)
    const card = cardRef.current
    if (card) {
      card.style.transition = ''
      card.style.transform  = ''
      card.style.opacity    = ''
    }
  }, [])

  // ── Жест начат ────────────────────────────────────────────────────────────
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return
    trackingRef.current    = true
    didNotifyStart.current = false
    startXRef.current      = e.touches[0].clientX
    startTimeRef.current   = Date.now()
    currentDxRef.current   = 0
  }, [disabled])

  // ── Жест движется ─────────────────────────────────────────────────────────
  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!trackingRef.current || disabled) return

    const dx  = e.touches[0].clientX - startXRef.current
    currentDxRef.current = dx

    const absDx = Math.abs(dx)

    // Уведомляем родителя один раз при пересечении мёртвой зоны
    if (absDx > 8) {
      e.stopPropagation()
      if (!didNotifyStart.current) {
        didNotifyStart.current = true
        cbRef.current.onSwipeStart?.()
      }
    } else {
      return  // внутри мёртвой зоны — не трогаем state
    }

    const clamped = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, dx))
    const hasDeepHandler = !!cbRef.current.onSwipeLeftDeep

    // Определяем зону одним вычислением
    let zone: Zone
    if (dx > 0) {
      zone = absDx >= ARCHIVE_PX ? 'right' : 'none'
    } else if (hasDeepHandler && absDx >= DELETE_PX) {
      zone = 'delete'
    } else if (absDx >= ARCHIVE_PX) {
      zone = 'archive'
    } else {
      zone = 'none'
    }

    setSw(prev => prev.offset === clamped && prev.zone === zone
      ? prev  // без изменений → пропускаем ре-рендер
      : { ...prev, offset: clamped, zone }
    )
  }, [disabled])

  // ── Жест завершён ─────────────────────────────────────────────────────────
  const onTouchEnd = useCallback(() => {
    if (!trackingRef.current) return
    trackingRef.current = false

    // Уведомляем ДО сброса (правильный порядок)
    cbRef.current.onSwipeEnd?.()

    const dx       = currentDxRef.current
    const absDx    = Math.abs(dx)
    const dt       = Date.now() - startTimeRef.current
    const velocity = absDx / dt
    const hasDeepHandler = !!cbRef.current.onSwipeLeftDeep

    // ── Delete zone ──────────────────────────────────────────────────────────
    if (dx < 0 && hasDeepHandler && absDx >= DELETE_PX) {
      setSw(INITIAL)
      cbRef.current.onSwipeLeftDeep!()
      return
    }

    // ── Archive / Done (порог или быстрый свайп) ─────────────────────────────
    const containerWidth   = containerRef.current?.offsetWidth ?? 300
    // Для быстрого свайпа достаточно 30px; для медленного — порог от ширины контейнера
    const reachedThreshold = absDx > containerWidth * ARCHIVE_RATIO
    const isFast           = velocity > VELOCITY_TRIGGER && absDx > MIN_SWIPE_PX

    if (reachedThreshold || isFast) {
      const flyTo = dx > 0 ? '110%' : '-110%'

      // Анимируем напрямую через DOM — избегаем конфликта с React-controlled transform
      const card = cardRef.current
      if (card) {
        card.style.transition = `transform ${FLY_DURATION} cubic-bezier(0.4,0,0.2,1), opacity ${FLY_DURATION} ease`
        card.style.transform  = `translateX(${flyTo})`
        card.style.opacity    = '0'
      }

      // Выставляем flying=true чтобы убрать background hint и заморозить offset
      setSw(prev => ({ ...prev, flying: true, flashing: true }))

      flyTimerRef.current = setTimeout(() => {
        // Вызываем action
        dx > 0 ? cbRef.current.onSwipeRight() : cbRef.current.onSwipeLeft()

        resetTimerRef.current = setTimeout(resetCard, 80)
      }, 240)

    } else {
      // Не дотянул — возврат пружиной через CSS
      setSw(INITIAL)
    }
  }, [resetCard])

  // ── Вычисляемые значения для рендера ─────────────────────────────────────
  const { offset, zone, flying } = sw

  const absOffset = Math.abs(offset)
  const showHint  = absOffset > 8 && !flying && !isDraggingGlobal

  // Прогресс фона: 0 при 8px, 1 при ARCHIVE_PX * 2 (плавное нарастание)
  const bgProgress = showHint
    ? Math.min((absOffset - 8) / (ARCHIVE_PX * 1.6), 1)
    : 0

  const bgColor =
    zone === 'right'   ? `rgba(62, 207, 142, ${bgProgress * 0.9})`   // зелёный
    : zone === 'delete'? `rgba(240, 112, 112, ${bgProgress * 0.9})`   // красный
    :                    `rgba(245, 166, 35,  ${bgProgress * 0.85})`  // янтарный

  const isActive = zone !== 'none'  // зона сработала → иконка увеличена

  // ── Render ────────────────────────────────────────────────────────────────
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
      {showHint && (
        <div
          className="absolute inset-0 rounded-[23.25px] flex items-center transition-colors duration-75"
          style={{
            background:     bgColor,
            justifyContent: zone === 'right' ? 'flex-start' : 'flex-end',
            paddingLeft:    zone === 'right' ? 20 : 0,
            paddingRight:   zone !== 'right' ? 20 : 0,
          }}
        >
          {/* Done */}
          {zone === 'right' && (
            <div className={cn('flex items-center gap-1.5 transition-transform duration-150', isActive ? 'scale-110' : 'scale-100')}>
              <CheckCircle2
                size={isActive ? 22 : 18}
                className="text-white transition-all duration-150"
                strokeWidth={isActive ? 2.5 : 2}
              />
              <span className="text-white text-xs font-bold tracking-wide">
                {t('swipeDone')}
              </span>
            </div>
          )}

          {/* Archive */}
          {zone === 'archive' && (
            <div className={cn('flex items-center gap-1.5 transition-transform duration-150', isActive ? 'scale-110' : 'scale-100')}>
              <span className="text-white text-xs font-bold tracking-wide">
                {t('swipeArchive')}
              </span>
              <Archive
                size={isActive ? 22 : 18}
                className="text-white transition-all duration-150"
                strokeWidth={isActive ? 2.5 : 2}
              />
            </div>
          )}

          {/* Delete */}
          {zone === 'delete' && (
            <div className="flex items-center gap-1.5 scale-110">
              <span className="text-white text-xs font-bold tracking-wide">
                {t('delete')}
              </span>
              <Trash2 size={22} className="text-white" strokeWidth={2.5} />
            </div>
          )}
        </div>
      )}

      {/* Card — transform управляется напрямую через ref во время flying,
          через inline style во всё остальное время */}
      <div
        ref={cardRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={flying ? undefined : {
          transform:  `translateX(${offset}px)`,
          transition: offset === 0
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