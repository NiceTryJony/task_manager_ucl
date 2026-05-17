'use client'

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { gsap } from 'gsap'
import { cn } from '@/lib/utils'

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

export function ContextMenu({ items, x, y, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    gsap.fromTo(menuRef.current,
      { scale: 0.85, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.2, ease: 'back.out(2)' }
    )
    const handler = (e: TouchEvent | MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [])

  function close() {
    gsap.to(menuRef.current, {
      scale: 0.85, opacity: 0, duration: 0.15, ease: 'power2.in',
      onComplete: onClose,
    })
  }

  const MENU_W  = 200
  const ITEM_H  = 48
  const PAD     = 16
  const menuH   = items.length * ITEM_H + 16

  // Clamp X — не выходить за края экрана
  const clampedX = Math.min(
    Math.max(PAD, x),
    window.innerWidth - MENU_W - PAD
  )

  // Flip вверх если не влезает снизу
  const fitsBelow = y + menuH + PAD < window.innerHeight
  const clampedY  = fitsBelow
    ? Math.max(PAD, y)
    : Math.max(PAD, y - menuH - 10)

  const origin = fitsBelow ? 'top right' : 'bottom right'

  // ✅ Portal — рендерим прямо в document.body, минуя
  //    трансформированный .page-container на десктопе.
  //    Иначе position:fixed позиционируется относительно
  //    transformed ancestor, а не viewport.
  return createPortal(
    <div className="fixed inset-0 z-[9999]" style={{ pointerEvents: 'none' }}>
      <div
        ref={menuRef}
        className="absolute bg-bg-surface border border-bg-border rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] py-2 overflow-hidden"
        style={{
          left:            clampedX,
          top:             clampedY,
          width:           MENU_W,
          pointerEvents:   'all',
          transformOrigin: origin,
        }}
      >
        {items.map((item, i) => (
          <button
            key={i}
            onClick={() => { item.onClick(); close() }}
            className={cn(
              'w-full flex items-center gap-3 px-4 py-3 text-sm font-medium',
              'hover:bg-bg-hover active:bg-bg-hover transition-colors text-left',
              item.color ?? 'text-text-primary'
            )}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>
    </div>,
    document.body
  )
}