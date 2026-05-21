'use client'

import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { User, CheckCircle2, AlertCircle, Trash2, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { LS_KEY_USER_ID, LS_KEY_USERNAME, LS_KEY_FIRST_NAME } from '@/hooks/useTelegram'
import { useI18n } from '@/lib/i18n-context'
import { apiFetch } from '@/lib/api-client'

// driver.js CSS is NOT imported here anymore — was adding ~12KB to every
// user's initial paint. We inject it lazily only when the tour fires.
// import 'driver.js/dist/driver.css'  ← REMOVED

interface Props {
  onIdentified: (userId: number, username: string, firstName: string) => void
}

export function UsernameModal({ onIdentified }: Props) {
  const { t } = useI18n()
  const [firstName, setFirstName] = useState('')
  const [username,  setUsername]  = useState('')
  const [pin,       setPin]       = useState(['', '', '', ''])
  const [fnError,   setFnError]   = useState<string | null>(null)
  const [unError,   setUnError]   = useState<string | null>(null)
  const [pinError,  setPinError]  = useState<string | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [showPin,   setShowPin]   = useState(false)
  const [mode, setMode] = useState<null | 'new' | 'existing'>(null)

  const modalRef   = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const fnRef      = useRef<HTMLInputElement>(null)
  const pinRefs    = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ]

  const isDev = process.env.NODE_ENV === 'development'

  function validateUsername(v: string): string | null {
    const c = v.trim().replace(/^@/, '')
    if (c.length < 3)  return t('validMin3')
    if (c.length > 32) return t('validMax32')
    if (!/^[a-zA-Z0-9_]+$/.test(c)) return t('validLetters')
    return null
  }

  // ── Entrance animation ────────────────────────────────────────
  useEffect(() => {
    gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.25 })
    gsap.fromTo(modalRef.current,
      { y: 40, opacity: 0, scale: 0.96 },
      { y: 0, opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(1.5)' }
    )
    setTimeout(() => fnRef.current?.focus(), 350)
  }, [])

  // ── Username lookup ──────────────────────────────────────────
  useEffect(() => {
    const clean = username.trim().replace(/^@/, '').toLowerCase()
    if (validateUsername(clean) !== null) { setMode(null); return }

    const timer = setTimeout(async () => {
      const res  = await apiFetch(`/api/users/search?q=${encodeURIComponent(clean)}&userId=0`)
      const data = await res.json()
      if (data.user) {
        setMode('existing')
        setFirstName(data.user.first_name)
      } else {
        setMode('new')
      }
    }, 600)

    return () => clearTimeout(timer)
  }, [username])

  // ── Onboarding tour — lazy-loaded ────────────────────────────
  // driver.js (~55KB gzipped) is dynamically imported only for first-time
  // users, after a delay, so it never blocks the initial paint.
  useEffect(() => {
    if (localStorage.getItem('taskflow_onboarding_done')) return

    const timer = setTimeout(async () => {
      // Inject driver.js CSS lazily — one <link> tag, cached by browser
      if (!document.getElementById('driver-css')) {
        const link  = document.createElement('link')
        link.id     = 'driver-css'
        link.rel    = 'stylesheet'
        link.href   = 'https://cdn.jsdelivr.net/npm/driver.js@1/dist/driver.css'
        document.head.appendChild(link)
      }

      // Dynamic import — webpack splits this into a separate chunk (~55KB)
      // loaded only when we actually need it.
      const { driver } = await import('driver.js')

      const driverObj = driver({
        showProgress: false,
        allowClose: true,
        nextBtnText: 'Далі →',
        prevBtnText: '← Назад',
        doneBtnText: 'Зрозуміло!',
        steps: [
          {
            element: '[data-onboard="firstname"]',
            popover: {
              title: "👋 Твоє ім'я",
              description: "Введи своє ім'я — так тебе бачитимуть інші учасники спільних списків.",
              side: 'bottom',
              align: 'start',
            },
          },
          {
            element: '[data-onboard="username"]',
            popover: {
              title: '🔖 Нікнейм',
              description: "Унікальне ім'я для входу в акаунт і для того щоб інші могли запросити тебе до свого списку через @нікнейм.",
              side: 'bottom',
              align: 'start',
            },
          },
          {
            element: '[data-onboard="pin"]',
            popover: {
              title: '🔐 PIN-код',
              description: "Захищає твій акаунт на нових пристроях. Запам'ятай його — без PIN не увійдеш.",
              side: 'top',
              align: 'center',
            },
          },
        ],
        onDestroyed: () => {
          localStorage.setItem('taskflow_onboarding_done', '1')
        },
      })
      driverObj.drive()
    }, 600)

    return () => clearTimeout(timer)
  }, [])

  // ── Derived state ────────────────────────────────────────────
  const cleanUn   = username.trim().replace(/^@/, '')
  const pinFull   = pin.join('')
  const isFnOk    = firstName.trim().length >= 1
  const isUnOk    = validateUsername(username) === null
  const isPinOk   = pinFull.length === 4
  const canSubmit = isFnOk && isUnOk && isPinOk && !loading

  function handlePinChange(idx: number, val: string) {
    if (!/^\d?$/.test(val)) return
    const next = [...pin]
    next[idx] = val
    setPin(next)
    setPinError(null)
    if (val && idx < 3) pinRefs[idx + 1].current?.focus()
  }

  function handlePinKeyDown(idx: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !pin[idx] && idx > 0) {
      pinRefs[idx - 1].current?.focus()
    }
  }

  async function handleSubmit() {
    if (!firstName.trim()) { setFnError(t('nameRequired')); return }
    const unErr = validateUsername(username)
    if (unErr) { setUnError(unErr); return }
    if (pinFull.length < 4) { setPinError(t('enter4DigitPin')); return }

    setLoading(true)
    setFnError(null); setUnError(null); setPinError(null)

    let data: any
    try {
      const res = await apiFetch('/api/users/identify', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username:   cleanUn,
          first_name: firstName.trim(),
          pin:        pinFull,
        }),
      })
      data = await res.json()

      if (!res.ok || !data.user) {
        if (data.error === 'Invalid PIN') {
          setPinError(t('incorrectPin'))
        } else {
          setUnError(data.error ?? t('failedToSave'))
        }
        setLoading(false)
        return
      }
    } catch {
      setUnError(t('networkError'))
      setLoading(false)
      return
    }

    localStorage.setItem(LS_KEY_USER_ID,    String(data.user.id))
    localStorage.setItem(LS_KEY_USERNAME,   cleanUn)
    localStorage.setItem(LS_KEY_FIRST_NAME, data.user.first_name)

    gsap.to(modalRef.current,   { y: 20, opacity: 0, scale: 0.95, duration: 0.2, ease: 'power2.in' })
    gsap.to(overlayRef.current, {
      opacity: 0, duration: 0.2, delay: 0.1,
      onComplete: () => {
        toast.success(data.isNew
          ? `${t('createAccount').replace('Create account', '')}${data.user.first_name} 🎉`
          : `${t('welcomeBack').replace('!', '')}, ${data.user.first_name}!`
        )
        onIdentified(data.user.id, cleanUn, data.user.first_name)
      },
    })
  }

  const titleText =
    mode === 'existing' ? t('welcomeBack') :
    mode === 'new'      ? t('createAccount') :
                          t('getStarted')

  const subtitleText =
    mode === 'existing' ? t('enterPinSignIn') :
    mode === 'new'      ? t('choosePinProtect') :
                          t('enterNameUsername')

  const pinInputStyle = (digit: string, hasError: boolean): React.CSSProperties => ({
    background:  hasError ? 'rgba(240,112,112,0.08)' : digit ? 'rgba(129,115,245,0.10)' : 'rgba(255,255,255,0.05)',
    border:      `1.5px solid ${hasError ? 'rgba(240,112,112,0.50)' : digit ? 'var(--c-accent)' : 'rgba(255,255,255,0.12)'}`,
    boxShadow:   digit && !hasError ? 'inset 0 1px 0 rgba(255,255,255,0.08), 0 0 10px rgba(129,115,245,0.15)' : 'inset 0 1px 0 rgba(255,255,255,0.05)',
    color:       hasError ? 'var(--c-danger)' : digit ? 'var(--c-accent)' : 'var(--text-primary)',
    borderRadius: 16,
    width: 56, height: 56,
    textAlign: 'center' as const,
    fontSize: 20, fontWeight: 700,
    outline: 'none',
    transition: 'all 150ms ease',
  })

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center px-4">
      <div ref={overlayRef} className="absolute inset-0 sheet-overlay" />

      <div
        ref={modalRef}
        className="relative w-full max-w-sm p-6"
        style={{
          background:          'var(--sheet-bg)',
          backdropFilter:      'var(--glass-blur)',
          WebkitBackdropFilter:'var(--glass-blur)',
          border:              '0.5px solid var(--glass-border-top)',
          borderRadius:        28,
          boxShadow:           'inset 0 1px 0 rgba(255,255,255,0.09), 0 32px 80px rgba(0,0,0,0.55)',
        }}
      >
        <div
          className="absolute top-0 left-8 right-8 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.14), transparent)' }}
        />

        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5 mx-auto"
          style={{ background: 'rgba(129,115,245,0.12)', border: '0.5px solid rgba(129,115,245,0.22)' }}
        >
          <User size={26} className="text-accent" />
        </div>
        <h2 className="text-xl font-bold text-center mb-1">{titleText}</h2>
        <p className="text-text-secondary text-sm text-center mb-6 leading-relaxed">{subtitleText}</p>

        {/* First Name */}
        <div className="mb-3">
          <label className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-1.5 block">
            {t('firstName')}
          </label>
          <div className="relative">
            <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-dim" />
            <input
              ref={fnRef}
              data-onboard="firstname"
              value={firstName}
              onChange={e => { setFirstName(e.target.value); setFnError(null) }}
              onKeyDown={e => e.key === 'Enter' && (document.getElementById('un-input') as HTMLInputElement)?.focus()}
              placeholder={t('yourNamePlaceholder')}
              className={cn('input-field pl-9 text-sm', fnError && 'border-danger/60')}
              maxLength={64}
              autoComplete="given-name"
              disabled={mode === 'existing'}
            />
          </div>
          {fnError && (
            <p className="text-xs text-danger flex items-center gap-1 mt-1 px-1">
              <AlertCircle size={11} /> {fnError}
            </p>
          )}
          {mode === 'existing' && (
            <p className="text-xs text-text-dim mt-1 px-1">{t('nameLoadedFromAccount')}</p>
          )}
        </div>

        {/* Username */}
        <div className="mb-4">
          <label className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-1.5 block">
            {t('username')}
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-dim font-mono text-sm select-none">@</span>
            <input
              id="un-input"
              data-onboard="username"
              value={username}
              onChange={e => { setUsername(e.target.value); setUnError(null); setMode(null) }}
              onKeyDown={e => e.key === 'Enter' && pinRefs[0].current?.focus()}
              placeholder="username"
              className={cn('input-field pl-8 font-mono text-sm', unError && 'border-danger/60')}
              maxLength={33}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
            {mode && (
              <span
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs px-2 py-0.5 rounded-full font-medium"
                style={mode === 'new'
                  ? { background: 'rgba(129,115,245,0.15)', color: 'var(--c-accent)' }
                  : { background: 'rgba(62,207,142,0.15)',  color: 'var(--c-emerald)' }
                }
              >
                {mode === 'new' ? 'New' : 'Found'}
              </span>
            )}
          </div>
          {unError && (
            <p className="text-xs text-danger flex items-center gap-1 mt-1 px-1">
              <AlertCircle size={11} /> {unError}
            </p>
          )}
        </div>

        {/* PIN */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-text-secondary uppercase tracking-widest">
              {mode === 'existing' ? t('yourPin') : t('choosePin')}
            </label>
            <button
              onClick={() => setShowPin(v => !v)}
              className="text-text-dim hover:text-text-secondary transition-colors p-1"
            >
              {showPin ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <div data-onboard="pin" className="flex gap-3 justify-center">
            {pin.map((digit, idx) => (
              <input
                key={idx}
                ref={pinRefs[idx]}
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                value={digit}
                onChange={e => handlePinChange(idx, e.target.value)}
                onKeyDown={e => handlePinKeyDown(idx, e)}
                onFocus={e => e.target.select()}
                style={pinInputStyle(digit, !!pinError)}
                maxLength={1}
              />
            ))}
          </div>
          {pinError ? (
            <p className="text-xs text-danger flex items-center justify-center gap-1 mt-2">
              <AlertCircle size={11} /> {pinError}
            </p>
          ) : mode === 'new' && isPinOk ? (
            <p className="text-xs text-emerald flex items-center justify-center gap-1 mt-2">
              <CheckCircle2 size={11} /> {t('pinSetRemember')}
            </p>
          ) : mode === 'existing' && !isPinOk ? (
            <p className="text-xs text-text-dim text-center mt-2">{t('enter4Digit')}</p>
          ) : null}
        </div>

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="btn-primary w-full py-3.5 text-base disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              {mode === 'existing' ? t('signingIn') : t('creatingAccount')}
            </span>
          ) : mode === 'existing' ? t('signIn') : t('continue')}
        </button>

        {isDev && (
          <button
            onClick={() => {
              [LS_KEY_USER_ID, LS_KEY_USERNAME, LS_KEY_FIRST_NAME].forEach(k => localStorage.removeItem(k))
              toast.success('Cleared — reload')
            }}
            className="mt-3 w-full text-xs text-text-dim hover:text-danger transition-colors py-2 flex items-center justify-center gap-1.5"
          >
            <Trash2 size={12} /> [Dev] Clear localStorage
          </button>
        )}

        <p className="text-xs text-text-dim text-center mt-4 leading-relaxed">
          {t('pinProtects')}
        </p>
      </div>
    </div>
  )
}