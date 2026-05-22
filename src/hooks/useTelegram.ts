'use client'

import { useEffect, useState, useCallback } from 'react'
import type { TgUser } from '@/types'
import { invalidateUserCache } from '@/lib/api-client'

// ── Single source of truth for localStorage keys ───────────────
export const LS_KEY_USER_ID    = 'taskflow_user_id'
export const LS_KEY_USERNAME   = 'taskflow_username'
export const LS_KEY_FIRST_NAME = 'taskflow_first_name'

export interface TelegramContext {
  user:          TgUser | null
  isReady:       boolean
  needsIdentify: boolean
  haptic: {
    light:   () => void
    medium:  () => void
    heavy:   () => void
    success: () => void
    error:   () => void
    warning: () => void
    select:  () => void
  }
  showConfirm: (message: string) => Promise<boolean>
  openLink:    (url: string) => void
  setIdentity: (userId: number, username: string, firstName: string) => void
}

export function useTelegram(): TelegramContext {
  const [user,          setUser]          = useState<TgUser | null>(null)
  const [isReady,       setIsReady]       = useState(false)
  const [needsIdentify, setNeedsIdentify] = useState(false)

  useEffect(() => {
    try { window?.Telegram?.WebApp?.ready(); window?.Telegram?.WebApp?.expand() } catch {}

    const storedId = localStorage.getItem(LS_KEY_USER_ID)
    const storedUn = localStorage.getItem(LS_KEY_USERNAME)
    const storedFn = localStorage.getItem(LS_KEY_FIRST_NAME)

    if (storedId && storedUn) {
      setUser({ id: Number(storedId), first_name: storedFn ?? storedUn, username: storedUn })
      setNeedsIdentify(false)
    } else {
      setNeedsIdentify(true)
    }
    setIsReady(true)
  }, [])

  const setIdentity = useCallback((userId: number, username: string, firstName: string) => {
    localStorage.setItem(LS_KEY_USER_ID,    String(userId))
    localStorage.setItem(LS_KEY_USERNAME,   username)
    localStorage.setItem(LS_KEY_FIRST_NAME, firstName)
    invalidateUserCache()
    setUser({ id: userId, first_name: firstName, username })
    setNeedsIdentify(false)
  }, [])

  const haptic = {
    light:   () => { try { window?.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light')          } catch {} },
    medium:  () => { try { window?.Telegram?.WebApp?.HapticFeedback?.impactOccurred('medium')         } catch {} },
    heavy:   () => { try { window?.Telegram?.WebApp?.HapticFeedback?.impactOccurred('heavy')          } catch {} },
    success: () => { try { window?.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success')  } catch {} },
    error:   () => { try { window?.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error')    } catch {} },
    warning: () => { try { window?.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('warning')  } catch {} },
    select:  () => { try { window?.Telegram?.WebApp?.HapticFeedback?.selectionChanged()               } catch {} },
  }

  const showConfirm = useCallback((message: string): Promise<boolean> => {
    return new Promise(resolve => {
      if (window?.Telegram?.WebApp?.showConfirm) {
        window.Telegram.WebApp.showConfirm(message, resolve)
      } else {
        resolve(window.confirm(message))
      }
    })
  }, [])

  const openLink = useCallback((url: string) => {
    try { window?.Telegram?.WebApp?.openLink(url) } catch { window.open(url, '_blank') }
  }, [])

  return { user, isReady, needsIdentify, haptic, showConfirm, openLink, setIdentity }
}