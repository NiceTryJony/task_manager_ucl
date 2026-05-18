'use client'

import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { X } from 'lucide-react'
import { LIST_COLORS, LIST_EMOJIS, cn } from '@/lib/utils'
import type { TaskList } from '@/types'
import { useI18n } from '@/lib/i18n-context'

interface Props {
  userId: number
  onClose: () => void
  onCreated: (list: TaskList) => void
}

export function CreateListSheet({ userId, onClose, onCreated }: Props) {
  const { t } = useI18n()
  const [title,   setTitle]   = useState('')
  const [emoji,   setEmoji]   = useState('📋')
  const [color,   setColor]   = useState('#7B6EF6')
  const [loading, setLoading] = useState(false)
  const sheetRef   = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2 })
    gsap.fromTo(sheetRef.current,
      { y: '100%' },
      { y: 0, duration: 0.35, ease: 'power3.out' }
    )
  }, [])

  function close() {
    gsap.to(sheetRef.current,   { y: '100%', duration: 0.25, ease: 'power3.in' })
    gsap.to(overlayRef.current, { opacity: 0, duration: 0.2, onComplete: onClose })
  }

  async function handleSubmit() {
    if (!title.trim()) return
    setLoading(true)
    const res = await fetch('/api/lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, title: title.trim(), emoji, color }),
    })
    const data = await res.json()
    if (data.list) onCreated(data.list)
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      {/* Single backdrop-filter on overlay */}
      <div
        ref={overlayRef}
        className="absolute inset-0 sheet-overlay"
        onClick={close}
      />

      {/* Sheet — one backdrop-filter, no blur on children */}
      <div
        ref={sheetRef}
        className="relative w-full px-4 pt-3 pb-8 z-10"
        style={{
          background:          'var(--sheet-bg)',
          backdropFilter:      'var(--glass-blur)',
          WebkitBackdropFilter:'var(--glass-blur)',
          borderRadius:        '24px 24px 0 0',
          borderTop:           '0.5px solid var(--glass-border-top)',
          boxShadow:           'var(--glass-shadow)',
        }}
      >
        {/* Top-edge highlight */}
        <div
          className="absolute top-0 left-12 right-12 h-px pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.14), transparent)' }}
        />

        <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: 'rgba(255,255,255,0.12)' }} />

        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold">{t('newListTitle')}</h2>
          <button onClick={close} className="btn-ghost p-2">
            <X size={18} />
          </button>
        </div>

        <input
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder={t('listName')}
          className="input-field text-lg font-semibold mb-5"
          maxLength={60}
        />

        <label className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-2 block">
          {t('icon')}
        </label>
        <div className="flex flex-wrap gap-2 mb-5">
          {LIST_EMOJIS.map(e => (
            <button
              key={e}
              onClick={() => setEmoji(e)}
              className="w-10 h-10 rounded-xl text-xl transition-all duration-150"
              style={emoji === e
                ? {
                    background:  'rgba(129,115,245,0.15)',
                    outline:     '1px solid var(--c-accent)',
                    transform:   'scale(1.10)',
                    boxShadow:   'inset 0 1px 0 rgba(255,255,255,0.08)',
                  }
                : {
                    background: 'rgba(255,255,255,0.05)',
                    border:     '0.5px solid rgba(255,255,255,0.08)',
                  }
              }
            >
              {e}
            </button>
          ))}
        </div>

        <label className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-2 block">
          {t('color')}
        </label>
        <div className="flex gap-2.5 mb-7">
          {LIST_COLORS.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className="w-8 h-8 rounded-full flex-shrink-0 transition-all duration-150"
              style={{
                background:    c,
                outline:       color === c ? `2px solid ${c}` : 'none',
                outlineOffset: '2px',
                transform:     color === c ? 'scale(1.2)' : 'scale(1)',
                boxShadow:     color === c ? `0 0 10px ${c}55` : 'none',
              }}
            />
          ))}
        </div>

        <button
          onClick={handleSubmit}
          disabled={!title.trim() || loading}
          className="btn-primary w-full py-3.5 text-base disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? t('creating') : t('createList')}
        </button>
      </div>
    </div>
  )
}