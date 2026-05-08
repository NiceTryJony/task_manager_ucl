// 'use client'

// import { useEffect, useState, useCallback } from 'react'
// import type { TgUser } from '@/types'

// export const LS_KEY_USERNAME = 'taskflow_username'
// export const LS_KEY_USER_ID  = 'taskflow_user_id'

// export interface TelegramContext {
//   user:            TgUser | null
//   initData:        string
//   isReady:         boolean
//   isDark:          boolean
//   isTelegramEnv:   boolean   // true = opened via Telegram
//   needsIdentify:   boolean   // true = browser, no localStorage identity yet
//   haptic: {
//     light:   () => void
//     medium:  () => void
//     heavy:   () => void
//     success: () => void
//     error:   () => void
//     warning: () => void
//     select:  () => void
//   }
//   showConfirm: (message: string) => Promise<boolean>
//   openLink:    (url: string) => void
//   expand:      () => void
//   setIdentity: (userId: number, username: string) => void
// }

// export function useTelegram(): TelegramContext {
//   const [user,          setUser]          = useState<TgUser | null>(null)
//   const [initData,      setInitData]      = useState('')
//   const [isReady,       setIsReady]       = useState(false)
//   const [isDark,        setIsDark]        = useState(true)
//   const [isTelegramEnv, setIsTelegramEnv] = useState(false)
//   const [needsIdentify, setNeedsIdentify] = useState(false)

//   useEffect(() => {
//     const tg = window?.Telegram?.WebApp
//     // Detect Telegram environment by presence of WebApp object, not initData
//     // TG v6.0 may pass empty initData but WebApp object is always present
//     const isTgEnv = !!(tg && typeof tg.ready === 'function')

//     if (isTgEnv) {
//       // ── Telegram Mini App path ────────────────────────────────
//       tg!.ready()
//       tg!.expand()
//       setIsTelegramEnv(true)

//       // Priority: initDataUnsafe → manual parse (TG v6.0 fix)
//       let resolvedUser = tg!.initDataUnsafe?.user ?? null
//       if (!resolvedUser) {
//         try {
//           const params  = new URLSearchParams(tg!.initData)
//           const userStr = params.get('user')
//           if (userStr) resolvedUser = JSON.parse(decodeURIComponent(userStr))
//         } catch {}
//       }

//       if (resolvedUser) {
//         // If user has a username, update localStorage to keep them in sync
//         if (resolvedUser.username) {
//           localStorage.setItem(LS_KEY_USERNAME, resolvedUser.username)
//           localStorage.setItem(LS_KEY_USER_ID,  String(resolvedUser.id))
//         }
//         setUser(resolvedUser)
//       } else {
//         // Telegram env but no user data → fallback to localStorage
//         const storedId = localStorage.getItem(LS_KEY_USER_ID)
//         const storedUn = localStorage.getItem(LS_KEY_USERNAME)
//         if (storedId && storedUn) {
//           setUser({ id: Number(storedId), first_name: storedUn, username: storedUn })
//         } else {
//           setUser({ id: 0, first_name: 'Guest' })
//         }
//       }

//       setInitData(tg!.initData ?? '')
//       setIsDark(tg!.colorScheme === 'dark')
//       setIsReady(true)

//     } else {
//       // ── Browser direct access path ────────────────────────────
//       setIsTelegramEnv(false)
//       setIsDark(window.matchMedia('(prefers-color-scheme: dark)').matches)

//       const storedId = localStorage.getItem(LS_KEY_USER_ID)
//       const storedUn = localStorage.getItem(LS_KEY_USERNAME)

//       if (storedId && storedUn) {
//         // Already identified — use stored identity
//         setUser({ id: Number(storedId), first_name: storedUn, username: storedUn })
//         setIsReady(true)
//         setNeedsIdentify(false)
//       } else {
//         // No identity — show modal (page.tsx handles this)
//         setNeedsIdentify(true)
//         setIsReady(true)
//       }
//     }
//   }, [])

//   // Called by page.tsx after UsernameModal succeeds
//   const setIdentity = useCallback((userId: number, username: string) => {
//     setUser({ id: userId, first_name: username, username })
//     setNeedsIdentify(false)
//   }, [])

//   const haptic = {
//     light:   () => window?.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light'),
//     medium:  () => window?.Telegram?.WebApp?.HapticFeedback?.impactOccurred('medium'),
//     heavy:   () => window?.Telegram?.WebApp?.HapticFeedback?.impactOccurred('heavy'),
//     success: () => window?.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success'),
//     error:   () => window?.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error'),
//     warning: () => window?.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('warning'),
//     select:  () => window?.Telegram?.WebApp?.HapticFeedback?.selectionChanged(),
//   }

//   const showConfirm = useCallback((message: string): Promise<boolean> => {
//     return new Promise(resolve => {
//       if (window?.Telegram?.WebApp?.showConfirm) {
//         window.Telegram.WebApp.showConfirm(message, resolve)
//       } else {
//         resolve(window.confirm(message))
//       }
//     })
//   }, [])

//   const openLink = useCallback((url: string) => {
//     window?.Telegram?.WebApp?.openLink(url) ?? window.open(url, '_blank')
//   }, [])

//   const expand = useCallback(() => {
//     window?.Telegram?.WebApp?.expand()
//   }, [])

//   return {
//     user, initData, isReady, isDark,
//     isTelegramEnv, needsIdentify,
//     haptic, showConfirm, openLink, expand, setIdentity,
//   }
// }
















'use client'

import { useEffect, useState, useCallback } from 'react'
import type { TgUser } from '@/types'

export const LS_KEY_USERNAME   = 'taskflow_username'
export const LS_KEY_FIRST_NAME = 'taskflow_first_name'
export const LS_KEY_USER_ID    = 'taskflow_user_id'

export interface TelegramContext {
  user:          TgUser | null
  initData:      string
  isReady:       boolean
  isDark:        boolean
  isTelegramEnv: boolean
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
  expand:      () => void
  setIdentity: (userId: number, username: string, firstName?: string) => void
}

export function useTelegram(): TelegramContext {
  const [user,          setUser]          = useState<TgUser | null>(null)
  const [initData,      setInitData]      = useState('')
  const [isReady,       setIsReady]       = useState(false)
  const [isDark,        setIsDark]        = useState(true)
  const [isTelegramEnv, setIsTelegramEnv] = useState(false)
  const [needsIdentify, setNeedsIdentify] = useState(false)

  useEffect(() => {
    const tg      = window?.Telegram?.WebApp
    const isTgEnv = !!(tg && typeof tg.ready === 'function')

    if (isTgEnv) {
      // ── Telegram Mini App path ──────────────────────────────
      tg!.ready()
      tg!.expand()
      setIsTelegramEnv(true)

      let resolvedUser = tg!.initDataUnsafe?.user ?? null
      if (!resolvedUser) {
        try {
          const params  = new URLSearchParams(tg!.initData)
          const userStr = params.get('user')
          if (userStr) resolvedUser = JSON.parse(decodeURIComponent(userStr))
        } catch {}
      }

      if (resolvedUser) {
        // Telegram data always has priority — update localStorage to keep in sync
        if (resolvedUser.username) {
          localStorage.setItem(LS_KEY_USERNAME,   resolvedUser.username)
          localStorage.setItem(LS_KEY_FIRST_NAME, resolvedUser.first_name ?? resolvedUser.username)
          localStorage.setItem(LS_KEY_USER_ID,    String(resolvedUser.id))
        }
        setUser(resolvedUser)
      } else {
        // TG env but no user data — fallback to localStorage
        const storedId = localStorage.getItem(LS_KEY_USER_ID)
        const storedUn = localStorage.getItem(LS_KEY_USERNAME)
        const storedFn = localStorage.getItem(LS_KEY_FIRST_NAME)
        if (storedId && storedUn) {
          setUser({ id: Number(storedId), first_name: storedFn ?? storedUn, username: storedUn })
        } else {
          setUser({ id: 0, first_name: 'Guest' })
        }
      }

      setInitData(tg!.initData ?? '')
      setIsDark(tg!.colorScheme === 'dark')
      setIsReady(true)

    } else {
      // ── Browser direct access path ──────────────────────────
      setIsTelegramEnv(false)
      setIsDark(window.matchMedia('(prefers-color-scheme: dark)').matches)

      const storedId = localStorage.getItem(LS_KEY_USER_ID)
      const storedUn = localStorage.getItem(LS_KEY_USERNAME)
      const storedFn = localStorage.getItem(LS_KEY_FIRST_NAME)

      if (storedId && storedUn) {
        setUser({ id: Number(storedId), first_name: storedFn ?? storedUn, username: storedUn })
        setIsReady(true)
        setNeedsIdentify(false)
      } else {
        // No identity — show modal
        setNeedsIdentify(true)
        setIsReady(true)
      }
    }
  }, [])

  const setIdentity = useCallback((userId: number, username: string, firstName?: string) => {
    const fn = firstName ?? username
    setUser({ id: userId, first_name: fn, username })
    setNeedsIdentify(false)
    // Keep localStorage in sync (usually already done by modal/settings, but ensure it)
    localStorage.setItem(LS_KEY_USERNAME,   username)
    localStorage.setItem(LS_KEY_FIRST_NAME, fn)
    localStorage.setItem(LS_KEY_USER_ID,    String(userId))
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

  return {
    user, initData, isReady, isDark,
    isTelegramEnv, needsIdentify,
    haptic, showConfirm, openLink, expand, setIdentity,
  }
}