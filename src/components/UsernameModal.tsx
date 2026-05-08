'use client'

import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { AtSign, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface Props {
  onIdentified: (userId: number, username: string) => void
}

function validateUsername(v: string): string | null {
  const clean = v.trim().replace(/^@/, '')
  if (clean.length < 3)  return 'Minimum 3 characters'
  if (clean.length > 32) return 'Maximum 32 characters'
  if (!/^[a-zA-Z0-9_]+$/.test(clean)) return 'Letters, numbers and _ only'
  return null
}


export function UsernameModal({ onIdentified }: Props) {
  const [value,   setValue]   = useState('')
  const [error,   setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [isDev]               = useState(process.env.NODE_ENV === 'development')

  const modalRef  = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)

  useEffect(() => {
    gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.25 })
    gsap.fromTo(modalRef.current,
      { y: 40, opacity: 0, scale: 0.96 },
      { y: 0,  opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(1.5)' }
    )
    setTimeout(() => inputRef.current?.focus(), 350)
  }, [])

  function handleInput(v: string) {
    setValue(v)
    // Clear error on type
    if (error) setError(null)
  }

  async function handleSubmit() {
    const clean = value.trim().replace(/^@/, '')
    const validErr = validateUsername(clean)
    if (validErr) { setError(validErr); return }

    setLoading(true)
    setError(null)

    const res  = await fetch('/api/users/identify', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username: clean }),
    })
    const data = await res.json()

    if (!res.ok || !data.user) {
      setError(data.error ?? 'Something went wrong')
      setLoading(false)
      return
    }

    // Persist to localStorage
    localStorage.setItem(LS_KEY_USERNAME, clean)
    localStorage.setItem(LS_KEY_USER_ID,  String(data.user.id))

    // Animate out
    gsap.to(modalRef.current,  { y: 20, opacity: 0, scale: 0.95, duration: 0.2, ease: 'power2.in' })
    gsap.to(overlayRef.current, {
      opacity: 0, duration: 0.2, delay: 0.1,
      onComplete: () => {
        toast.success(data.isNew
          ? `Welcome, @${clean}! Profile created.`
          : `Welcome back, @${clean}!`
        )
        onIdentified(data.user.id, clean)
      },
    })
  }

  function handleClearDev() {
    localStorage.removeItem(LS_KEY_USERNAME)
    localStorage.removeItem(LS_KEY_USER_ID)
    toast.success('localStorage cleared — reload to test')
  }

  const charCount = value.trim().replace(/^@/, '').length
  const isValid   = charCount >= 3 && validateUsername(value.trim()) === null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center px-4">
      {/* Overlay */}
      <div ref={overlayRef} className="absolute inset-0 sheet-overlay" />

      {/* Modal */}
      <div ref={modalRef} className="relative w-full max-w-sm bg-bg-surface border border-bg-border rounded-3xl p-6 shadow-[0_24px_64px_rgba(0,0,0,0.6)]">
        {/* Icon */}
        <div className="w-14 h-14 rounded-2xl bg-accent/15 flex items-center justify-center mb-5 mx-auto animate-float">
          <AtSign size={26} className="text-accent" />
        </div>

        <h2 className="text-xl font-bold text-center mb-1">Who are you?</h2>
        <p className="text-text-secondary text-sm text-center mb-6 leading-relaxed">
          Enter your Telegram username to sync your tasks across devices
        </p>

        {/* Input */}
        <div className="relative mb-2">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-dim font-mono text-sm select-none">@</span>
          <input
            ref={inputRef}
            value={value}
            onChange={e => handleInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && isValid && handleSubmit()}
            placeholder="username"
            className={cn(
              'input-field pl-8 font-mono text-sm',
              error && 'border-danger/60 focus:border-danger/60 focus:ring-danger/20'
            )}
            maxLength={33}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </div>

        {/* Char counter + validation */}
        <div className="flex items-center justify-between mb-5 px-1">
          {error ? (
            <span className="text-xs text-danger flex items-center gap-1">
              <AlertCircle size={12} /> {error}
            </span>
          ) : isValid ? (
            <span className="text-xs text-emerald flex items-center gap-1">
              <CheckCircle2 size={12} /> Looks good
            </span>
          ) : (
            <span className="text-xs text-text-dim">
              {charCount < 3 ? `${3 - charCount} more chars needed` : 'Letters, numbers, _'}
            </span>
          )}
          <span className="text-xs text-text-dim font-mono">{charCount}/32</span>
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!isValid || loading}
          className="btn-primary w-full py-3.5 text-base disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Identifying…
            </span>
          ) : 'Continue'}
        </button>

        {/* Dev helper */}
        {isDev && (
          <button
            onClick={handleClearDev}
            className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs text-text-dim hover:text-danger transition-colors py-2"
          >
            <Trash2 size={12} />
            [Dev] Clear localStorage
          </button>
        )}

        <p className="text-xs text-text-dim text-center mt-4 leading-relaxed">
          Your username links your data across Telegram and browser.
        </p>
      </div>
    </div>
  )
}

// ── Helpers exported for use in useTelegram / page ──────────────
export const LS_KEY_USERNAME = 'taskflow_username'
export const LS_KEY_USER_ID  = 'taskflow_user_id'

export function getStoredIdentity(): { userId: number; username: string } | null {
  try {
    const username = localStorage.getItem('taskflow_username')
    const userIdStr = localStorage.getItem('taskflow_user_id')
    if (!username || !userIdStr) return null
    const userId = Number(userIdStr)
    if (isNaN(userId)) return null
    return { userId, username }
  } catch {
    return null
  }
}