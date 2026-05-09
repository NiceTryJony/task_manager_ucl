'use client'

import { useEffect, useState } from 'react'
import { useTaskStore } from '@/lib/store'
import { CheckCircle2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type Status = 'idle' | 'saving' | 'saved' | 'error'

export function SaveBanner() {
  const pendingOps   = useTaskStore(s => s.pendingOps)
  const lastError    = useTaskStore(s => s.lastSaveError)
  const [status, setStatus] = useState<Status>('idle')

  useEffect(() => {
    if (pendingOps > 0) {
      setStatus('saving')
      return
    }
    // pendingOps только что стало 0 — операция завершилась
    if (status === 'saving') {
      const next = lastError ? 'error' : 'saved'
      setStatus(next)
      const delay = next === 'error' ? 3000 : 1500
      const t = setTimeout(() => setStatus('idle'), delay)
      return () => clearTimeout(t)
    }
  }, [pendingOps, lastError])

  if (status === 'idle') return null

  return (
    <div
      className={cn(
        'fixed left-1/2 -translate-x-1/2 z-[300]',
        'flex items-center gap-2 px-4 py-2 rounded-full',
        'text-xs font-semibold select-none pointer-events-none',
        'shadow-[0_4px_20px_rgba(0,0,0,0.5)]',
        'animate-fade-up',
        status === 'saving' && 'bg-bg-surface border border-accent/40 text-text-primary top-[calc(var(--safe-top)+12px)]',
        status === 'saved'  && 'bg-emerald/15 border border-emerald/30 text-emerald top-[calc(var(--safe-top)+12px)]',
        status === 'error'  && 'bg-danger/15 border border-danger/30 text-danger top-[calc(var(--safe-top)+12px)]',
      )}
    >
      {status === 'saving' && (
        <>
          <div className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin flex-shrink-0" />
          Сохранение…
        </>
      )}
      {status === 'saved' && (
        <>
          <CheckCircle2 size={13} />
          Сохранено
        </>
      )}
      {status === 'error' && (
        <>
          <AlertCircle size={13} />
          Ошибка — изменения не сохранены
        </>
      )}
    </div>
  )
}