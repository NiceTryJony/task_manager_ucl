'use client'

import { useEffect, useState } from 'react'
import { useTaskStore } from '@/lib/store'
import { useI18n } from '@/lib/i18n-context'
import { CheckCircle2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type Status = 'idle' | 'saving' | 'saved' | 'error'

export function SaveBanner() {
  const pendingOps = useTaskStore(s => s.pendingOps)
  const lastError  = useTaskStore(s => s.lastSaveError)
  const { t } = useI18n()
  const [status, setStatus] = useState<Status>('idle')

  useEffect(() => {
    if (pendingOps > 0) {
      setStatus('saving')
      return
    }
    if (status === 'saving') {
      const next = lastError ? 'error' : 'saved'
      setStatus(next)
      const delay = next === 'error' ? 3000 : 1500
      const timer = setTimeout(() => setStatus('idle'), delay)
      return () => clearTimeout(timer)
    }
  }, [pendingOps, lastError])

  if (status === 'idle') return null

  // Glass pill — один backdrop-filter, без дочерних blur
  const glassBase: React.CSSProperties = {
    backdropFilter:      'blur(20px)',
    WebkitBackdropFilter:'blur(20px)',
    boxShadow:           'inset 0 1px 0 rgba(255,255,255,0.10), 0 4px 24px rgba(0,0,0,0.40)',
  }

  const variants: Record<'saving' | 'saved' | 'error', React.CSSProperties> = {
    saving: {
      background: 'rgba(18, 21, 34, 0.82)',
      border:     '0.5px solid rgba(129,115,245,0.35)',
      color:      'var(--text-primary)',
    },
    saved: {
      background: 'rgba(62, 207, 142, 0.12)',
      border:     '0.5px solid rgba(62,207,142,0.30)',
      color:      'var(--c-emerald)',
    },
    error: {
      background: 'rgba(240,112,112,0.12)',
      border:     '0.5px solid rgba(240,112,112,0.30)',
      color:      'var(--c-danger)',
    },
  }

  return (
    <div
      className={cn(
        'fixed left-1/2 -translate-x-1/2 z-[300]',
        'flex items-center gap-2 px-4 py-2 rounded-full',
        'text-xs font-semibold select-none pointer-events-none',
        'animate-fade-up',
        'top-[calc(var(--safe-top)+12px)]',
      )}
      // style={{ ...glassBase, ...(status !== 'idle' ? variants[status] : {}) }}
    >
      {status === 'saving' && (
        <>
          <div
            className="w-3 h-3 rounded-full border-2 flex-shrink-0"
            style={{
              borderColor:    'rgba(129,115,245,0.30)',
              borderTopColor: 'var(--c-accent)',
              animation:      'spin 0.7s linear infinite',
            }}
          />
          {t('saving')}
        </>
      )}
      {status === 'saved' && (
        <>
          <CheckCircle2 size={13} />
          {t('saved')}
        </>
      )}
      {status === 'error' && (
        <>
          <AlertCircle size={13} />
          {t('saveError')}
        </>
      )}
    </div>
  )
}