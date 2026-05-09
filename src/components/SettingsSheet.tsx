'use client'

import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { X, User, Lock, Eye, EyeOff, Save, LogOut, AlertCircle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { LS_KEY_USER_ID, LS_KEY_USERNAME, LS_KEY_FIRST_NAME } from '@/hooks/useTelegram'

interface Props {
  userId:    number
  firstName: string
  username:  string
  onClose:   () => void
  onUpdated: (firstName: string) => void
}

export function SettingsSheet({ userId, firstName, username, onClose, onUpdated }: Props) {
  const [newFirstName, setNewFirstName] = useState(firstName)
  const [currentPin,   setCurrentPin]   = useState(['', '', '', ''])
  const [newPin,       setNewPin]       = useState(['', '', '', ''])
  const [confirmPin,   setConfirmPin]   = useState(['', '', '', ''])
  const [showCurrent,  setShowCurrent]  = useState(false)
  const [showNew,      setShowNew]      = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [saving,       setSaving]       = useState(false)
  const [pinSection,   setPinSection]   = useState(false)

  const sheetRef   = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  const pinRefs = {
    current: [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)],
    new:     [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)],
    confirm: [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)],
  }

  useEffect(() => {
    gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2 })
    gsap.fromTo(sheetRef.current, { y: '100%' }, { y: 0, duration: 0.35, ease: 'power3.out' })
  }, [])

  function close() {
    gsap.to(sheetRef.current,   { y: '100%', duration: 0.25, ease: 'power3.in' })
    gsap.to(overlayRef.current, { opacity: 0, duration: 0.2, onComplete: onClose })
  }

  function makePinHandler(
    arr: string[],
    setArr: (v: string[]) => void,
    refs: React.RefObject<HTMLInputElement>[]
  ) {
    return {
      onChange: (idx: number, val: string) => {
        if (!/^\d?$/.test(val)) return
        const next = [...arr]; next[idx] = val; setArr(next); setError(null)
        if (val && idx < 3) refs[idx + 1].current?.focus()
      },
      onKeyDown: (idx: number, e: React.KeyboardEvent) => {
        if (e.key === 'Backspace' && !arr[idx] && idx > 0) refs[idx - 1].current?.focus()
      },
    }
  }

  const currentH = makePinHandler(currentPin, setCurrentPin, pinRefs.current)
  const newH     = makePinHandler(newPin, setNewPin, pinRefs.new)
  const confirmH = makePinHandler(confirmPin, setConfirmPin, pinRefs.confirm)

  const newPinFull     = newPin.join('')
  const confirmPinFull = confirmPin.join('')
  const pinsMatch      = newPinFull.length === 4 && newPinFull === confirmPinFull

  async function handleSaveName() {
    if (currentPin.join('').length < 4) {
      setError('Enter current PIN to confirm changes')
      return
    }
    if (!newFirstName.trim()) { setError('Name cannot be empty'); return }

    setSaving(true); setError(null)
    const res  = await fetch('/api/users/identify', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, current_pin: currentPin.join(''), first_name: newFirstName.trim() }),
    })
    const data = await res.json()
    setSaving(false)

    if (!res.ok) {
      setError(data.error === 'Invalid PIN' ? 'Incorrect PIN' : data.error)
      return
    }

    localStorage.setItem(LS_KEY_FIRST_NAME, newFirstName.trim())
    toast.success('Name updated!')
    onUpdated(newFirstName.trim())
    close()
  }

  async function handleChangePin() {
    if (currentPin.join('').length < 4) { setError('Enter current PIN'); return }
    if (newPinFull.length < 4)          { setError('Enter new PIN');     return }
    if (!pinsMatch)                     { setError('PINs do not match'); return }

    setSaving(true); setError(null)
    const res  = await fetch('/api/users/identify', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, current_pin: currentPin.join(''), new_pin: newPinFull }),
    })
    const data = await res.json()
    setSaving(false)

    if (!res.ok) {
      setError(data.error === 'Invalid PIN' ? 'Incorrect current PIN' : data.error)
      return
    }
    toast.success('PIN changed!')
    close()
  }

  function handleSignOut() {
    ;[LS_KEY_USER_ID, LS_KEY_USERNAME, LS_KEY_FIRST_NAME].forEach(k => localStorage.removeItem(k))
    toast.success('Signed out')
    window.location.reload()
  }

  function PinRow({
    label, values, refs, show, onToggleShow, handlers,
  }: {
    label:       string
    values:      string[]
    refs:        React.RefObject<HTMLInputElement>[]
    show:        boolean
    onToggleShow: () => void
    handlers:    ReturnType<typeof makePinHandler>
  }) {
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-text-secondary">{label}</label>
          <button onClick={onToggleShow} className="text-text-dim hover:text-text-secondary p-1">
            {show ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>
        <div className="flex gap-2 justify-center">
          {values.map((d, i) => (
            <input
              key={i}
              ref={refs[i]}
              type={show ? 'text' : 'password'}
              inputMode="numeric"
              value={d}
              onChange={e => handlers.onChange(i, e.target.value)}
              onKeyDown={e => handlers.onKeyDown(i, e)}
              onFocus={e => e.target.select()}
              className={cn(
                'w-12 h-12 text-center text-lg font-bold rounded-xl border-2 bg-bg-card',
                'focus:outline-none transition-all duration-150',
                d ? 'border-accent text-accent' : 'border-bg-border focus:border-accent/60'
              )}
              maxLength={1}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div ref={overlayRef} className="absolute inset-0 sheet-overlay" onClick={close} />
      <div ref={sheetRef} className="relative w-full bg-bg-surface rounded-t-3xl border-t border-bg-border z-10 max-h-[90dvh] flex flex-col">

        <div className="flex-shrink-0 px-4 pt-3 pb-4">
          <div className="w-10 h-1 bg-bg-border rounded-full mx-auto mb-4" />
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Settings</h2>
            <button onClick={close} className="btn-ghost p-2"><X size={18} /></button>
          </div>
        </div>

        <div className="flex-1 scrollable px-4 pb-8 space-y-6">

          {/* Avatar */}
          <div className="flex flex-col items-center py-2">
            <div className="w-16 h-16 rounded-2xl bg-accent/20 flex items-center justify-center text-2xl font-bold text-accent mb-2">
              {newFirstName[0]?.toUpperCase() ?? '?'}
            </div>
            <p className="font-semibold">{firstName}</p>
            <p className="text-text-secondary text-sm">@{username}</p>
          </div>

          {/* Profile */}
          <div>
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-3">Profile</p>
            <label className="text-xs text-text-secondary mb-1.5 block">First Name</label>
            <div className="relative">
              <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-dim" />
              <input
                value={newFirstName}
                onChange={e => setNewFirstName(e.target.value)}
                className="input-field pl-9 text-sm"
                maxLength={64}
              />
            </div>
            <p className="text-xs text-text-dim mt-1.5 px-1">
              Username (@{username}) cannot be changed to preserve your data.
            </p>
          </div>

          {/* Current PIN (required for any change) */}
          <div>
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-3">
              Confirm with PIN
            </p>
            <PinRow
              label="Current PIN"
              values={currentPin}
              refs={pinRefs.current}
              show={showCurrent}
              onToggleShow={() => setShowCurrent(v => !v)}
              handlers={currentH}
            />
          </div>

          {/* Save name button — only shown when name changed */}
          {newFirstName.trim() !== firstName && (
            <button
              onClick={handleSaveName}
              disabled={saving || currentPin.join('').length < 4}
              className="btn-primary w-full py-3 flex items-center justify-center gap-2 disabled:opacity-40"
            >
              <Save size={16} />
              {saving ? 'Saving…' : 'Save Name'}
            </button>
          )}

          {/* Change PIN section */}
          <div>
            <button
              onClick={() => setPinSection(v => !v)}
              className="flex items-center gap-2 text-sm font-medium text-accent"
            >
              <Lock size={15} />
              {pinSection ? 'Cancel PIN change' : 'Change PIN'}
            </button>

            {pinSection && (
              <div className="mt-4 space-y-4 animate-fade-up">
                <PinRow
                  label="New PIN"
                  values={newPin}
                  refs={pinRefs.new}
                  show={showNew}
                  onToggleShow={() => setShowNew(v => !v)}
                  handlers={newH}
                />
                <PinRow
                  label="Confirm New PIN"
                  values={confirmPin}
                  refs={pinRefs.confirm}
                  show={showNew}
                  onToggleShow={() => setShowNew(v => !v)}
                  handlers={confirmH}
                />
                {newPinFull.length === 4 && confirmPinFull.length === 4 && (
                  <p className={cn('text-xs flex items-center gap-1', pinsMatch ? 'text-emerald' : 'text-danger')}>
                    {pinsMatch ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
                    {pinsMatch ? 'PINs match' : 'PINs do not match'}
                  </p>
                )}
                <button
                  onClick={handleChangePin}
                  disabled={saving || !pinsMatch || currentPin.join('').length < 4}
                  className="btn-primary w-full py-3 disabled:opacity-40"
                >
                  {saving ? 'Saving…' : 'Update PIN'}
                </button>
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-danger/10 border border-danger/20 rounded-xl text-sm text-danger">
              <AlertCircle size={15} /> {error}
            </div>
          )}

          {/* Account info */}
          <div className="bg-bg-card rounded-2xl p-4 border border-bg-border space-y-2">
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-2">Account</p>
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">User ID</span>
              <span className="font-mono text-xs text-text-primary">{userId}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">Username</span>
              <span className="text-text-primary">@{username}</span>
            </div>
          </div>

          {/* Sign out */}
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-danger hover:bg-danger/10 border border-danger/20 transition-colors"
          >
            <LogOut size={15} /> Sign Out
          </button>
        </div>
      </div>
    </div>
  )
}