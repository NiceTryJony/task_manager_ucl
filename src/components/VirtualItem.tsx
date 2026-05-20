'use client'

/**
 * VirtualItem + VirtualList
 * Место: src/components/VirtualItem.tsx
 *
 * Рендерит children только когда элемент попадает во viewport.
 * После первого появления не размонтирует (чтобы не терять state).
 */

import {
  useRef, useState, useEffect, memo,
  type ReactNode, type CSSProperties,
} from 'react'

// ── VirtualItem ───────────────────────────────────────────────

interface VirtualItemProps {
  children:    ReactNode
  /** Высота placeholder до первого появления */
  minHeight?:  number
  /** Насколько заранее начинать рендер */
  rootMargin?: string
  className?:  string
  style?:      CSSProperties
}

export const VirtualItem = memo(function VirtualItem({
  children,
  minHeight = 48,
  rootMargin = '120px',
  className,
  style,
}: VirtualItemProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // Первые элементы уже в viewport — монтируем без IO
    const rect = el.getBoundingClientRect()
    if (rect.top < window.innerHeight + 200) {
      setMounted(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setMounted(true)
          observer.disconnect()
        }
      },
      { threshold: 0, rootMargin }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [rootMargin])

  return (
    <div
      ref={ref}
      className={className}
      style={mounted ? style : { minHeight, ...style }}
    >
      {mounted ? children : null}
    </div>
  )
})

// ── VirtualList ───────────────────────────────────────────────

interface VirtualListProps<T> {
  items:      T[]
  children:   (item: T, index: number) => ReactNode
  getKey:     (item: T, index: number) => string | number
  minHeight?: number
  gap?:       string
  /** Первые N рендерить сразу без IO — они всегда видны */
  eager?:     number
}

export function VirtualList<T>({
  items,
  children,
  getKey,
  minHeight = 48,
  gap = 'space-y-1.5',
  eager = 8,
}: VirtualListProps<T>) {
  return (
    <div className={gap}>
      {items.map((item, idx) => {
        const key = getKey(item, idx)
        return idx < eager ? (
          <div key={key}>{children(item, idx)}</div>
        ) : (
          <VirtualItem key={key} minHeight={minHeight}>
            {children(item, idx)}
          </VirtualItem>
        )
      })}
    </div>
  )
}