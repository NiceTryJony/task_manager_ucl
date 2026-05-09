'use client'

import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { User, CheckCircle2, AlertCircle, Trash2, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { LS_KEY_USER_ID, LS_KEY_USERNAME, LS_KEY_FIRST_NAME } from '@/hooks/useTelegram'

interface Props {
  onIdentified: (userId: number, username: string, firstName: string) => void
}

function validateUsername(v: string): string | null {
  const c = v.trim().replace(/^@/, '')
  if (c.length < 3)  return 'Minimum 3 characters'
  if (c.length > 32) return 'Maximum 32 characters'
  if (!/^[a-zA-Z0-9_]+$/.test(c)) return 'Letters, numbers and _ only'
  return null
}

export function UsernameModal({ onIdentified }: Props) {
  const [firstName, setFirstName] = useState('')
  const [username,  setUsername]  = useState('')
  const [pin,       setPin]       = useState(['', '', '', ''])
  const [fnError,   setFnError]   = useState<string | null>(null)
  const [unError,   setUnError]   = useState<string | null>(null)
  const [pinError,  setPinError]  = useState<string | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [showPin,   setShowPin]   = useState(false)
  // null = unknown, 'new' = creating, 'existing' = logging in
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

  useEffect(() => {
    gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.25 })
    gsap.fromTo(modalRef.current,
      { y: 40, opacity: 0, scale: 0.96 },
      { y: 0, opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(1.5)' }
    )
    setTimeout(() => fnRef.current?.focus(), 350)
  }, [])

  // Debounce username lookup to show new/existing mode hint
  useEffect(() => {
    const clean = username.trim().replace(/^@/, '').toLowerCase()
    if (validateUsername(clean) !== null) { setMode(null); return }

    const t = setTimeout(async () => {
      const res  = await fetch(`/api/users/search?q=${encodeURIComponent(clean)}&userId=0`)
      const data = await res.json()
      setMode(data.user ? 'existing' : 'new')
    }, 600)

    return () => clearTimeout(t)
  }, [username])

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
    if (!firstName.trim()) { setFnError('Name is required'); return }
    const unErr = validateUsername(username)
    if (unErr) { setUnError(unErr); return }
    if (pinFull.length < 4) { setPinError('Enter 4-digit PIN'); return }

    setLoading(true)
    setFnError(null); setUnError(null); setPinError(null)

    let data: any
    try {
      const res = await fetch('/api/users/identify', {
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
          setPinError('Incorrect PIN')
        } else {
          setUnError(data.error ?? 'Something went wrong')
        }
        setLoading(false)
        return
      }
    } catch {
      setUnError('Server error')
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
          ? `Account created! Welcome, ${data.user.first_name} 🎉`
          : `Welcome back, ${data.user.first_name}!`
        )
        onIdentified(data.user.id, cleanUn, data.user.first_name)
      },
    })
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center px-4">
      <div ref={overlayRef} className="absolute inset-0 sheet-overlay" />

      <div ref={modalRef} className="relative w-full max-w-sm bg-bg-surface border border-bg-border rounded-3xl p-6 shadow-[0_24px_64px_rgba(0,0,0,0.6)]">

        <div className="w-14 h-14 rounded-2xl bg-accent/15 flex items-center justify-center mb-5 mx-auto animate-float">
          <User size={26} className="text-accent" />
        </div>
        <h2 className="text-xl font-bold text-center mb-1">
          {mode === 'existing' ? 'Welcome back!' : mode === 'new' ? 'Create account' : 'Get started'}
        </h2>
        <p className="text-text-secondary text-sm text-center mb-6 leading-relaxed">
          {mode === 'existing'
            ? 'Enter your PIN to sign in'
            : mode === 'new'
            ? 'Choose a PIN to protect your account'
            : 'Enter your name and Telegram username'}
        </p>

        {/* First Name */}
        <div className="mb-3">
          <label className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-1.5 block">
            First Name
          </label>
          <div className="relative">
            <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-dim" />
            <input
              ref={fnRef}
              value={firstName}
              onChange={e => { setFirstName(e.target.value); setFnError(null) }}
              onKeyDown={e => e.key === 'Enter' && (document.getElementById('un-input') as HTMLInputElement)?.focus()}
              placeholder="Your name…"
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
            <p className="text-xs text-text-dim mt-1 px-1">Name loaded from your account</p>
          )}
        </div>

        {/* Username */}
        <div className="mb-4">
          <label className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-1.5 block">
            Username
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-dim font-mono text-sm select-none">@</span>
            <input
              id="un-input"
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
              <span className={cn(
                'absolute right-3 top-1/2 -translate-y-1/2 text-xs px-2 py-0.5 rounded-full font-medium',
                mode === 'new' ? 'bg-accent/20 text-accent' : 'bg-emerald/20 text-emerald'
              )}>
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
              {mode === 'existing' ? 'Your PIN' : 'Choose PIN'}
            </label>
            <button
              onClick={() => setShowPin(v => !v)}
              className="text-text-dim hover:text-text-secondary transition-colors p-1"
            >
              {showPin ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <div className="flex gap-3 justify-center">
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
                className={cn(
                  'w-14 h-14 text-center text-xl font-bold rounded-2xl border-2 bg-bg-card',
                  'focus:outline-none transition-all duration-150',
                  pinError
                    ? 'border-danger/60 bg-danger/5'
                    : digit
                    ? 'border-accent text-accent'
                    : 'border-bg-border text-text-primary focus:border-accent/60'
                )}
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
              <CheckCircle2 size={11} /> PIN set — remember it!
            </p>
          ) : mode === 'existing' && !isPinOk ? (
            <p className="text-xs text-text-dim text-center mt-2">Enter 4-digit PIN to continue</p>
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
              {mode === 'existing' ? 'Signing in…' : 'Creating account…'}
            </span>
          ) : mode === 'existing' ? 'Sign In' : 'Continue'}
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
          PIN protects your account on new devices. You can change it in Settings.
        </p>
      </div>
    </div>
  )
}