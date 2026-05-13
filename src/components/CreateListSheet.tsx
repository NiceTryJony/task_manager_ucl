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
      <div
        ref={overlayRef}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={close}
      />

      <div
        ref={sheetRef}
        className="relative w-full bg-bg-surface rounded-t-3xl border-t border-bg-border px-4 pt-3 pb-8 z-10"
      >
        <div className="w-10 h-1 bg-bg-border rounded-full mx-auto mb-5" />

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
              className={cn(
                'w-10 h-10 rounded-xl text-xl transition-all',
                emoji === e
                  ? 'bg-accent/20 ring-1 ring-accent scale-110'
                  : 'bg-bg-card hover:bg-bg-hover'
              )}
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
              className="w-8 h-8 rounded-full transition-all"
              style={{
                background: c,
                outline: color === c ? `2px solid ${c}` : 'none',
                outlineOffset: '2px',
                transform: color === c ? 'scale(1.2)' : 'scale(1)',
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