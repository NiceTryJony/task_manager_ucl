'use client'

import { useCallback } from 'react'
import { useTaskStore } from '@/lib/store'

export function usePending() {
  const inc       = useTaskStore(s => s.incrementPending)
  const dec       = useTaskStore(s => s.decrementPending)
  const isPending = useTaskStore(s => s.pendingOps > 0)

  const run = useCallback(async <T>(
    fn: () => Promise<T>,
    onError?: (e: unknown) => void
  ): Promise<T | null> => {
    inc()
    try {
      const result = await fn()
      dec(false)
      return result
    } catch (e) {
      dec(true)
      onError?.(e)
      return null
    }
  }, [inc, dec])

  return { run, isPending }
}