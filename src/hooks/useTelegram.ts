'use client'

import { useEffect, useState, useCallback } from 'react'
import type { TgUser } from '@/types'

interface TelegramContext {
  user: TgUser | null
  initData: string
  isReady: boolean
  isDark: boolean
  haptic: {
    light: () => void
    medium: () => void
    heavy: () => void
    success: () => void
    error: () => void
    warning: () => void
    select: () => void
  }
  showConfirm: (message: string) => Promise<boolean>
  openLink: (url: string) => void
  expand: () => void
}

export function useTelegram(): TelegramContext {
  const [user, setUser]       = useState<TgUser | null>(null)
  const [initData, setInitData] = useState('')
  const [isReady, setIsReady]  = useState(false)
  const [isDark, setIsDark]    = useState(true)

  useEffect(() => {
    const tg = window?.Telegram?.WebApp
    if (!tg) {
      // Dev fallback: mock user
      setUser({ id: 123456789, first_name: 'Developer', username: 'dev' })
      setIsReady(true)
      setIsDark(true)
      return
    }

    tg.ready()
    tg.expand()

    // Try initDataUnsafe first, then parse initData string manually (TG v6.0 fix)
    let resolvedUser = tg.initDataUnsafe?.user ?? null
    if (!resolvedUser && tg.initData) {
      try {
        const params = new URLSearchParams(tg.initData)
        const userStr = params.get('user')
        if (userStr) resolvedUser = JSON.parse(decodeURIComponent(userStr))
      } catch {}
    }

    setUser(resolvedUser ?? { id: 0, first_name: 'Guest' })
    setInitData(tg.initData ?? '')
    setIsDark(tg.colorScheme === 'dark')
    setIsReady(true)
  }, [])

  const haptic = {
    light:   () => window?.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light'),
    medium:  () => window?.Telegram?.WebApp?.HapticFeedback?.impactOccurred('medium'),
    heavy:   () => window?.Telegram?.WebApp?.HapticFeedback?.impactOccurred('heavy'),
    success: () => window?.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success'),
    error:   () => window?.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error'),
    warning: () => window?.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('warning'),
    select:  () => window?.Telegram?.WebApp?.HapticFeedback?.selectionChanged(),
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
    window?.Telegram?.WebApp?.openLink(url) ?? window.open(url, '_blank')
  }, [])

  const expand = useCallback(() => {
    window?.Telegram?.WebApp?.expand()
  }, [])

  return { user, initData, isReady, isDark, haptic, showConfirm, openLink, expand }
}
