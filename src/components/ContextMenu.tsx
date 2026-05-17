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
      { scale: 0.85, opacity: 0, y: -4 },
      { scale: 1, opacity: 1, y: 0, duration: 0.22, ease: 'back.out(2)' }
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
      scale: 0.85, opacity: 0, y: -4, duration: 0.15, ease: 'power2.in',
      onComplete: onClose,
    })
  }

  const MENU_W  = 200
  const ITEM_H  = 48
  const PAD     = 16
  const menuH   = items.length * ITEM_H + 16

  const clampedX = Math.min(Math.max(PAD, x), window.innerWidth - MENU_W - PAD)
  const fitsBelow = y + menuH + PAD < window.innerHeight
  const clampedY  = fitsBelow ? Math.max(PAD, y) : Math.max(PAD, y - menuH - 10)
  const origin    = fitsBelow ? 'top right' : 'bottom right'

  return createPortal(
    <div className="fixed inset-0 z-[9999]" style={{ pointerEvents: 'none' }}>
      <div
        ref={menuRef}
        className="absolute py-2 overflow-hidden"
        style={{
          left:            clampedX,
          top:             clampedY,
          width:           MENU_W,
          pointerEvents:   'all',
          transformOrigin: origin,
          borderRadius:    18,
          // ── glassmorphism ──────────────────────────────────
          background:          'var(--dropdown-bg)',
          backdropFilter:      'var(--glass-blur)',
          WebkitBackdropFilter:'var(--glass-blur)',
          border:              '0.5px solid var(--dropdown-border)',
          boxShadow:           'var(--dropdown-shadow)',
        }}
      >
        {/* Top-edge highlight */}
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)' }}
        />

        {items.map((item, i) => (
          <button
            key={i}
            onClick={() => { item.onClick(); close() }}
            className={cn(
              'w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-left',
              'transition-colors duration-100',
              item.color ?? 'text-text-primary'
            )}
            style={{
              background: 'transparent',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = 'transparent'
            }}
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