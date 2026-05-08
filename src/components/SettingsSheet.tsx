'use client'

import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { X, User, AtSign, CheckCircle2, AlertCircle, LogOut, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { LS_KEY_USERNAME, LS_KEY_FIRST_NAME, LS_KEY_USER_ID } from './UsernameModal'

interface Props {
  userId:    number
  firstName: string
  username:  string
  isTgEnv:   boolean
  onClose:   () => void
  onUpdated: (userId: number, username: string, firstName: string) => void
}

function validateUsername(v: string): string | null {
  const clean = v.trim().replace(/^@/, '')
  if (clean.length < 3)  return 'Minimum 3 characters'
  if (clean.length > 32) return 'Maximum 32 characters'
  if (!/^[a-zA-Z0-9_]+$/.test(clean)) return 'Letters, numbers and _ only'
  return null
}

function validateFirstName(v: string): string | null {
  if (v.trim().length < 1)  return 'Name is required'
  if (v.trim().length > 64) return 'Maximum 64 characters'
  return null
}

export function SettingsSheet({ userId, firstName, username, isTgEnv, onClose, onUpdated }: Props) {
  const [newFirstName, setNewFirstName] = useState(firstName)
  const [newUsername,  setNewUsername]  = useState(username)
  const [fnError,      setFnError]      = useState<string | null>(null)
  const [unError,      setUnError]      = useState<string | null>(null)
  const [saving,       setSaving]       = useState(false)

  const sheetRef   = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2 })
    gsap.fromTo(sheetRef.current, { y: '100%' }, { y: 0, duration: 0.35, ease: 'power3.out' })
  }, [])

  function close() {
    gsap.to(sheetRef.current,   { y: '100%', duration: 0.25, ease: 'power3.in' })
    gsap.to(overlayRef.current, { opacity: 0, duration: 0.2, onComplete: onClose })
  }

  const cleanUn       = newUsername.trim().replace(/^@/, '')
  const isFnChanged   = newFirstName.trim() !== firstName
  const isUnChanged   = cleanUn !== username
  const hasChanges    = isFnChanged || isUnChanged
  const isFnOk        = validateFirstName(newFirstName) === null
  const isUnOk        = validateUsername(newUsername) === null
  const canSave       = hasChanges && isFnOk && isUnOk && !saving

  async function handleSave() {
    const fnErr = validateFirstName(newFirstName)
    const unErr = validateUsername(newUsername)
    if (fnErr) { setFnError(fnErr); return }
    if (unErr) { setUnError(unErr); return }

    setSaving(true)

    try {
      // Update profile on backend (PATCH = update existing user by ID)
      const res = await fetch('/api/users/identify', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          username:   cleanUn,
          first_name: newFirstName.trim(),
        }),
      })
      const data = await res.json()

      if (!res.ok || !data.user) {
        setUnError(data.error ?? 'Failed to update profile')
        setSaving(false)
        return
      }

      // Save to localStorage
      localStorage.setItem(LS_KEY_FIRST_NAME, newFirstName.trim())
      localStorage.setItem(LS_KEY_USERNAME,   cleanUn)
      // userId stays the same

      toast.success('Profile updated!')
      onUpdated(userId, cleanUn, newFirstName.trim())
      close()
    } catch {
      setUnError('Server error')
    } finally {
      setSaving(false)
    }
  }

  function handleSignOut() {
    localStorage.removeItem(LS_KEY_USERNAME)
    localStorage.removeItem(LS_KEY_FIRST_NAME)
    localStorage.removeItem(LS_KEY_USER_ID)
    toast.success('Signed out')
    window.location.reload()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div ref={overlayRef} className="absolute inset-0 sheet-overlay" onClick={close} />

      <div ref={sheetRef} className="relative w-full bg-bg-surface rounded-t-3xl border-t border-bg-border z-10 max-h-[90dvh] flex flex-col">
        {/* Handle + header */}
        <div className="flex-shrink-0 px-4 pt-3 pb-4">
          <div className="w-10 h-1 bg-bg-border rounded-full mx-auto mb-4" />
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Settings</h2>
            <button onClick={close} className="btn-ghost p-2"><X size={18} /></button>
          </div>
        </div>

        <div className="flex-1 scrollable px-4 pb-8 space-y-6">
          {/* Profile avatar */}
          <div className="flex flex-col items-center py-2">
            <div className="w-16 h-16 rounded-2xl bg-accent/20 flex items-center justify-center text-2xl font-bold text-accent mb-2">
              {(newFirstName || firstName)[0]?.toUpperCase() ?? '?'}
            </div>
            <p className="font-semibold text-base">{newFirstName || firstName}</p>
            <p className="text-text-secondary text-sm">@{newUsername || username}</p>
            {isTgEnv && (
              <span className="mt-1.5 px-2 py-0.5 bg-accent/15 text-accent text-xs rounded-full">
                Telegram account
              </span>
            )}
          </div>

          {/* Profile section */}
          <div>
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-3">My Profile</p>

            {/* First name */}
            <div className="mb-3">
              <label className="text-xs text-text-secondary mb-1.5 block">First Name</label>
              <div className="relative">
                <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-dim" />
                <input
                  value={newFirstName}
                  onChange={e => { setNewFirstName(e.target.value); if (fnError) setFnError(null) }}
                  disabled={isTgEnv}
                  placeholder="Your name…"
                  className={cn(
                    'input-field pl-9 text-sm',
                    isTgEnv && 'opacity-60 cursor-not-allowed',
                    fnError && 'border-danger/60'
                  )}
                  maxLength={64}
                />
              </div>
              {fnError && (
                <span className="text-xs text-danger flex items-center gap-1 mt-1 px-1">
                  <AlertCircle size={11} /> {fnError}
                </span>
              )}
              {isTgEnv && (
                <p className="text-xs text-text-dim mt-1 px-1">Synced from Telegram — change in Telegram profile</p>
              )}
            </div>

            {/* Username */}
            <div>
              <label className="text-xs text-text-secondary mb-1.5 block">Telegram Username</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-dim font-mono text-sm select-none">@</span>
                <input
                  value={newUsername}
                  onChange={e => { setNewUsername(e.target.value); if (unError) setUnError(null) }}
                  disabled={isTgEnv}
                  placeholder="username"
                  className={cn(
                    'input-field pl-8 font-mono text-sm',
                    isTgEnv && 'opacity-60 cursor-not-allowed',
                    unError && 'border-danger/60'
                  )}
                  maxLength={33}
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </div>
              {unError && (
                <span className="text-xs text-danger flex items-center gap-1 mt-1 px-1">
                  <AlertCircle size={11} /> {unError}
                </span>
              )}
              {isTgEnv && (
                <p className="text-xs text-text-dim mt-1 px-1">Synced from Telegram — change in Telegram profile</p>
              )}
              {!isTgEnv && isUnChanged && cleanUn.length >= 3 && !unError && (
                <p className="text-xs text-amber mt-1 px-1 flex items-center gap-1">
                  <AlertCircle size={11} />
                  Changing username will switch your profile identity
                </p>
              )}
            </div>
          </div>

          {/* Save button — only for browser users */}
          {!isTgEnv && (
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="btn-primary w-full py-3 flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {saving ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Save size={16} />
              )}
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          )}

          {/* Account info */}
          <div className="bg-bg-card rounded-2xl p-4 border border-bg-border space-y-2">
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-3">Account Info</p>
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">User ID</span>
              <span className="font-mono text-text-primary text-xs">{userId}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">Login method</span>
              <span className="text-text-primary text-xs">{isTgEnv ? 'Telegram Mini App' : 'Browser / Manual'}</span>
            </div>
          </div>

          {/* Sign out (browser only) */}
          {!isTgEnv && (
            <div>
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-3">Danger Zone</p>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-danger hover:bg-danger/10 border border-danger/20 transition-colors"
              >
                <LogOut size={15} />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}