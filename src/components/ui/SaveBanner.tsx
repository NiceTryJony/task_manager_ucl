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

  return (
    <div
      className={cn(
        'fixed left-1/2 -translate-x-1/2 z-[300]',
        'flex items-center gap-2 px-4 py-2 rounded-full',
        'text-xs font-semibold select-none pointer-events-none',
        'shadow-[0_4px_20px_rgba(0,0,0,0.5)] animate-fade-up',
        'top-[calc(var(--safe-top)+12px)]',
        status === 'saving' && 'bg-bg-surface border border-accent/40 text-text-primary',
        status === 'saved'  && 'bg-emerald/15 border border-emerald/30 text-emerald',
        status === 'error'  && 'bg-danger/15 border border-danger/30 text-danger',
      )}
    >
      {status === 'saving' && (
        <>
          <div className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin flex-shrink-0" />
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