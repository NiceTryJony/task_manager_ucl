'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ContextMenuItem {
  label:   string
  icon:    string
  color?:  string
  onClick: () => void
}

interface Props {
  items:   ContextMenuItem[]
  x:       number
  y:       number
  onClose: () => void
}

// ── Constants (вне компонента — не пересоздаются) ─────────────────────────────

const MENU_W   = 200
const ITEM_H   = 48
const MENU_PY  = 8    // padding-y внутри блока
const PAD      = 12   // отступ от краёв экрана

// ── CSS анимации (вместо GSAP ~100kb) ─────────────────────────────────────────

const ANIM_CSS = `
  @keyframes _ctx-in {
    from { transform: scale(0.88); opacity: 0; }
    to   { transform: scale(1);    opacity: 1; }
  }
  @keyframes _ctx-out {
    from { transform: scale(1);    opacity: 1; }
    to   { transform: scale(0.88); opacity: 0; }
  }
  .ctx-enter { animation: _ctx-in  0.18s cubic-bezier(0.34,1.56,0.64,1) both; }
  .ctx-exit  { animation: _ctx-out 0.14s ease-in both; }

  /* CSS hover вместо onMouseEnter/onMouseLeave DOM-мутаций */
  .ctx-item:hover { background: rgba(255,255,255,0.07) !important; }
  @media (hover: none) { .ctx-item:hover { background: transparent !important; } }
`

// ── Позиционирование — вычисляется один раз при маунте ─────────────────────────

function calcPosition(x: number, y: number, itemCount: number) {
  // SSR-safe: window доступен только на клиенте
  const vw = typeof window !== 'undefined' ? window.innerWidth  : 390
  const vh = typeof window !== 'undefined' ? window.innerHeight : 844

  const menuH = itemCount * ITEM_H + MENU_PY * 2

  // X: пробуем правее точки тапа; не влезает → левее
  let left = x
  if (left + MENU_W + PAD > vw) left = x - MENU_W
  left = Math.max(PAD, Math.min(left, vw - MENU_W - PAD))

  // Y: пробуем ниже; не влезает → выше
  const fitsBelow = y + menuH + PAD < vh
  let top = fitsBelow ? y : y - menuH
  top = Math.max(PAD, Math.min(top, vh - menuH - PAD))

  // transformOrigin для "раскрытия" из точки тапа
  const originX = x + MENU_W + PAD > vw ? 'right' : 'left'
  const originY = fitsBelow ? 'top' : 'bottom'

  return { left, top, origin: `${originY} ${originX}` }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ContextMenu({ items, x, y, onClose }: Props) {
  const menuRef    = useRef<HTMLDivElement>(null)
  const closingRef = useRef(false)   // предотвращает двойной вызов close()

  // Актуальный onClose через ref — устраняет stale closure в document handler
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  // SSR-safe portal: монтируем только на клиенте
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // Позиция вычисляется один раз (x/y не меняются пока меню открыто)
  const pos = calcPosition(x, y, items.length)

  // ── Закрытие с анимацией ────────────────────────────────────────────────
  const close = useCallback(() => {
    if (closingRef.current) return   // защита от двойного тапа
    closingRef.current = true

    const el = menuRef.current
    if (!el) { onCloseRef.current(); return }

    el.classList.replace('ctx-enter', 'ctx-exit')

    // onClose вызывается через ref — всегда актуальный, не stale
    const onEnd = () => {
      el.removeEventListener('animationend', onEnd)
      onCloseRef.current()
    }
    el.addEventListener('animationend', onEnd, { once: true })

    // Страховка: если анимация не сработала (hidden tab, reduced-motion) — 200ms timeout
    setTimeout(() => {
      if (closingRef.current) onCloseRef.current()
    }, 200)
  }, [])

  // ── Клик вне меню → закрыть ─────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        close()
      }
    }
    // capture: true — перехватываем до любых onClick в дереве
    document.addEventListener('mousedown',  handler, { capture: true })
    document.addEventListener('touchstart', handler, { capture: true })
    return () => {
      document.removeEventListener('mousedown',  handler, { capture: true })
      document.removeEventListener('touchstart', handler, { capture: true })
    }
  }, [close])

  // ── Escape → закрыть ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [close])

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-[9999]" style={{ pointerEvents: 'none' }}>
      <style>{ANIM_CSS}</style>

      <div
        ref={menuRef}
        role="menu"
        aria-modal="true"
        className="ctx-enter absolute py-2 overflow-hidden"
        style={{
          left:            pos.left,
          top:             pos.top,
          width:           MENU_W,
          pointerEvents:   'all',
          transformOrigin: pos.origin,
          borderRadius:    18,
          // ── glassmorphism (CSS-переменные из темы) ───────────
          background:           'var(--dropdown-bg)',
          backdropFilter:       'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)',
          border:               '0.5px solid var(--dropdown-border)',
          boxShadow:            'var(--dropdown-shadow)',
        }}
      >
        {/* Top-edge highlight */}
        <div
          className="absolute top-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)' }}
        />

        {items.map((item, i) => (
          <button
            key={i}
            role="menuitem"
            onClick={() => { item.onClick(); close() }}
            className={cn(
              'ctx-item w-full flex items-center gap-3 px-4 py-3',
              'text-sm font-medium text-left transition-colors duration-75',
              item.color ?? 'text-text-primary',
            )}
          >
            <span className="text-base leading-none">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>
    </div>,
    document.body
  )
}