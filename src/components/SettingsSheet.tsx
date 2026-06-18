'use client'

import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { X, User, Lock, Eye, EyeOff, Save, LogOut, AlertCircle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { LS_KEY_USER_ID, LS_KEY_USERNAME, LS_KEY_FIRST_NAME } from '@/hooks/useTelegram'
import { useI18n } from '@/lib/i18n-context'
import type { Lang } from '@/lib/i18n'
import { apiFetch } from '@/lib/api-client'

interface Props {
  userId:    number
  firstName: string
  username:  string
  onClose:   () => void
  onUpdated: (firstName: string) => void
}

export function SettingsSheet({ userId, firstName, username, onClose, onUpdated }: Props) {
  const { t, lang, setLang } = useI18n()

  const [newFirstName, setNewFirstName] = useState(firstName)
  const [currentPin,   setCurrentPin]   = useState(['', '', '', ''])
  const [newPin,       setNewPin]       = useState(['', '', '', ''])
  const [confirmPin,   setConfirmPin]   = useState(['', '', '', ''])
  const [showCurrent,  setShowCurrent]  = useState(false)
  const [showNew,      setShowNew]      = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [saving,       setSaving]       = useState(false)
  const [pinSection,   setPinSection]   = useState(false)
  const [showUsers,  setShowUsers]  = useState(false)
  const [usersList,  setUsersList]  = useState<{ id: number; username: string | null; first_name: string; created_at: string }[]>([])
  const [usersLoading, setUsersLoading] = useState(false)

  async function loadUsers() {
    if (usersList.length) { setShowUsers(v => !v); return }
    setShowUsers(true)
    setUsersLoading(true)
    try {
      const res = await apiFetch('/api/users')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setUsersList(data.users ?? [])
    } catch (e) 
    {
    console.error('[SettingsSheet] loadUsers failed:', e)
    toast.error('Не вдалося завантажити користувачів')
  }
    setUsersLoading(false)
  }

  const sheetRef   = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  const pinRefs = {
    current: [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)],
    new:     [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)],
    confirm: [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)],
  }

  const [perfMode, setPerfMode] = useState<'low' | 'high'>(
    () => (localStorage.getItem('taskflow_perf') === 'low' ? 'low' : 'high')
  )

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
    if (currentPin.join('').length < 4) { setError(t('enterCurrentPinConfirm')); return }
    if (!newFirstName.trim()) { setError(t('nameEmpty')); return }

    setSaving(true); setError(null)
    const res  = await apiFetch('/api/users/identify', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, current_pin: currentPin.join(''), first_name: newFirstName.trim() }),
    })
    const data = await res.json()
    setSaving(false)

    if (!res.ok) {
      setError(data.error === 'Invalid PIN' ? t('incorrectPin') : data.error)
      return
    }

    localStorage.setItem(LS_KEY_FIRST_NAME, newFirstName.trim())
    toast.success(t('nameUpdated'))
    onUpdated(newFirstName.trim())
    close()
  }

  async function handleChangePin() {
    if (currentPin.join('').length < 4) { setError(t('enterCurrentPinShort')); return }
    if (newPinFull.length < 4)          { setError(t('enterNewPinShort'));     return }
    if (!pinsMatch)                     { setError(t('pinsNoMatch'));           return }

    setSaving(true); setError(null)
    const res  = await apiFetch('/api/users/identify', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, current_pin: currentPin.join(''), new_pin: newPinFull }),
    })
    const data = await res.json()
    setSaving(false)

    if (!res.ok) {
      setError(data.error === 'Invalid PIN' ? t('incorrectCurrentPin') : data.error)
      return
    }
    toast.success(t('pinChanged'))
    close()
  }

  function handleSignOut() {
    ;[LS_KEY_USER_ID, LS_KEY_USERNAME, LS_KEY_FIRST_NAME].forEach(k => localStorage.removeItem(k))
    toast.success(t('signedOut'))
    window.location.reload()
  }

  // Glass PIN input style
  const pinInputStyle = (digit: string): React.CSSProperties => ({
    background:   digit ? 'rgba(129,115,245,0.10)' : 'rgba(255,255,255,0.05)',
    border:       `1.5px solid ${digit ? 'var(--c-accent)' : 'rgba(255,255,255,0.10)'}`,
    boxShadow:    digit ? 'inset 0 1px 0 rgba(255,255,255,0.08)' : 'inset 0 1px 0 rgba(255,255,255,0.04)',
    color:        digit ? 'var(--c-accent)' : 'var(--text-primary)',
    width: 48, height: 48,
    borderRadius: 12,
    textAlign:    'center' as const,
    fontSize: 18, fontWeight: 700,
    outline: 'none',
    transition: 'all 150ms ease',
  })

  function PinRow({
    label, values, refs, show, onToggleShow, handlers,
  }: {
    label:        string
    values:       string[]
    refs:         React.RefObject<HTMLInputElement>[]
    show:         boolean
    onToggleShow: () => void
    handlers:     ReturnType<typeof makePinHandler>
  }) {
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-text-secondary">{label}</label>
          <button onClick={onToggleShow} className="text-text-dim hover:text-text-secondary p-1 transition-colors">
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
              style={pinInputStyle(d)}
              maxLength={1}
            />
          ))}
        </div>
      </div>
    )
  }

  // Glass section card style
  const sectionCard: React.CSSProperties = {
    background:  'rgba(255,255,255,0.04)',
    border:      '0.5px solid rgba(255,255,255,0.08)',
    boxShadow:   'inset 0 1px 0 rgba(255,255,255,0.05)',
    borderRadius: 18,
    padding:     '16px',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div ref={overlayRef} className="absolute inset-0 sheet-overlay" onClick={close} />
      <div
        ref={sheetRef}
        className="relative w-full max-h-[90dvh] flex flex-col"
        style={{
          background:          'var(--sheet-bg)',
          backdropFilter:      'var(--glass-blur)',
          WebkitBackdropFilter:'var(--glass-blur)',
          borderRadius:        '24px 24px 0 0',
          borderTop:           '0.5px solid var(--glass-border-top)',
          boxShadow:           'var(--glass-shadow)',
        }}
      >
        {/* Top shimmer */}
        <div
          className="absolute top-0 left-12 right-12 h-px pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.14), transparent)' }}
        />

        <div className="flex-shrink-0 px-4 pt-3 pb-4">
          <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: 'rgba(255,255,255,0.12)' }} />
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">{t('settings')}</h2>
            <button onClick={close} className="btn-ghost p-2"><X size={18} /></button>
          </div>
        </div>

        <div className="flex-1 scrollable px-4 pb-8 space-y-5">

          {/* Avatar */}
          <div className="flex flex-col items-center py-2">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold mb-2"
              style={{
                background: 'rgba(129,115,245,0.14)',
                border:     '0.5px solid rgba(129,115,245,0.25)',
                boxShadow:  'inset 0 1px 0 rgba(255,255,255,0.08)',
                color:      'var(--c-accent)',
              }}
            >
              {newFirstName[0]?.toUpperCase() ?? '?'}
            </div>
            <p className="font-semibold">{firstName}</p>
            <p className="text-text-secondary text-sm">@{username}</p>
          </div>

          {/* Profile */}
          <div>
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-3">{t('profile')}</p>
            <label className="text-xs text-text-secondary mb-1.5 block">{t('firstName')}</label>
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
              {t('usernameChangeNote')}
            </p>
          </div>

          {/* Current PIN */}
          <div style={sectionCard}>
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-3">
              {t('confirmWithPin')}
            </p>
            <PinRow
              label={t('currentPin')}
              values={currentPin}
              refs={pinRefs.current}
              show={showCurrent}
              onToggleShow={() => setShowCurrent(v => !v)}
              handlers={currentH}
            />
          </div>

          {/* Save name button */}
          {newFirstName.trim() !== firstName && (
            <button
              onClick={handleSaveName}
              disabled={saving || currentPin.join('').length < 4}
              className="btn-primary w-full py-3 flex items-center justify-center gap-2 disabled:opacity-40"
            >
              <Save size={16} />
              {saving ? t('saving') : t('saveName')}
            </button>
          )}

          {/* Change PIN section */}
          <div>
            <button
              onClick={() => setPinSection(v => !v)}
              className="flex items-center gap-2 text-sm font-medium text-accent transition-colors"
            >
              <Lock size={15} />
              {pinSection ? t('cancelPinChange') : t('changePin')}
            </button>

            {pinSection && (
              <div className="mt-4 space-y-4 animate-fade-up" style={{ ...sectionCard }}>
                <PinRow
                  label={t('newPin')}
                  values={newPin}
                  refs={pinRefs.new}
                  show={showNew}
                  onToggleShow={() => setShowNew(v => !v)}
                  handlers={newH}
                />
                <PinRow
                  label={t('confirmNewPin')}
                  values={confirmPin}
                  refs={pinRefs.confirm}
                  show={showNew}
                  onToggleShow={() => setShowNew(v => !v)}
                  handlers={confirmH}
                />
                {newPinFull.length === 4 && confirmPinFull.length === 4 && (
                  <p className={cn('text-xs flex items-center gap-1', pinsMatch ? 'text-emerald' : 'text-danger')}>
                    {pinsMatch ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
                    {pinsMatch ? t('pinsMatch') : t('pinsNoMatch')}
                  </p>
                )}
                <button
                  onClick={handleChangePin}
                  disabled={saving || !pinsMatch || currentPin.join('').length < 4}
                  className="btn-primary w-full py-3 disabled:opacity-40"
                >
                  {saving ? t('saving') : t('updatePin')}
                </button>
              </div>
            )}
          </div>

          {error && (
            <div
              className="flex items-center gap-2 p-3 rounded-xl text-sm text-danger"
              style={{
                background: 'rgba(240,112,112,0.08)',
                border:     '0.5px solid rgba(240,112,112,0.22)',
              }}
            >
              <AlertCircle size={15} /> {error}
            </div>
          )}

          {/* Account info */}
          <div style={sectionCard}>
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-2">{t('account')}</p>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">{t('userId')}</span>
                <span className="font-mono text-xs text-text-primary">{userId}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">{t('username')}</span>
                <span className="text-text-primary">@{username}</span>
              </div>
            </div>
          </div>

          {/* Language */}
          <div style={sectionCard}>
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-3">
              {t('language')}
            </p>
            <div className="flex gap-2">
              {(['en', 'uk'] as Lang[]).map(l => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
                  style={lang === l
                    ? { background: 'var(--c-accent)', color: '#fff' }
                    : {
                        background: 'rgba(255,255,255,0.05)',
                        border:     '0.5px solid rgba(255,255,255,0.09)',
                        color:      'var(--text-secondary)',
                      }
                  }
                >
                  {l === 'en' ? '🇬🇧 English' : '🇺🇦 Українська'}
                </button>
              ))}
            </div>
          </div>

          {/* Performance */}
          <div style={sectionCard}>
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-3">
              {t('performance')}
            </p>
            <button
              onClick={() => {
                const next = perfMode === 'low' ? 'high' : 'low'
                setPerfMode(next)
                if (next === 'low') {
                  // document.documentElement.setAttribute('data-perf', 'low')
                  localStorage.setItem('taskflow_perf', next)
                  window.location.reload() // вместо setAttribute('data-perf', ...)
                } else {
                  document.documentElement.removeAttribute('data-perf')
                }
                localStorage.setItem('taskflow_perf', next)
              }}
              className="flex items-center justify-between w-full"
            >
              <div className="text-left">
                <p className="text-sm text-text-primary">{t('reducedMotion')}</p>
                <p className="text-xs text-text-dim mt-0.5">{t('reducedMotionDesc')}</p>
              </div>
              <div
                className="relative w-11 h-6 rounded-full flex-shrink-0 ml-4 transition-colors duration-200"
                style={{ background: perfMode === 'low' ? 'var(--c-accent)' : 'rgba(255,255,255,0.12)' }}
              >
                <div
                  className="absolute top-1 w-4 h-4 rounded-full bg-white transition-transform duration-200"
                  style={{ transform: perfMode === 'low' ? 'translateX(22px)' : 'translateX(4px)' }}
                />
              </div>
            </button>
          </div>

          
          {/* Users list */}
          <div style={sectionCard}>
            <button
              onClick={loadUsers}
              className="flex items-center justify-between w-full"
            >
              <div className="text-left">
                <p className="text-sm text-text-primary">Користувачі</p>
                <p className="text-xs text-text-dim mt-0.5">
                  {usersList.length > 0 ? `${usersList.length} зареєстровано` : 'Хто входив у застосунок'}
                </p>
              </div>
              <svg
                width="14" height="14" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2"
                style={{
                  color:     'var(--text-dim)',
                  transform: showUsers ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.2s ease',
                  flexShrink: 0,
                }}
              >
                <path d="m6 9 6 6 6-6"/>
              </svg>
            </button>

            {showUsers && (
              <div className="mt-3" style={{ borderTop: '0.5px solid rgba(255,255,255,0.07)', paddingTop: 12 }}>
                {usersLoading ? (
                  <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="h-10 skeleton rounded-xl" />
                    ))}
                  </div>
                ) : usersList.length === 0 ? (
                  <p className="text-xs text-text-dim text-center py-2">Нікого немає</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto scrollable">
                    {usersList.map(u => (
                      <div key={u.id} className="flex items-center gap-2.5">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                          style={{ background: 'rgba(129,115,245,0.14)', color: 'var(--c-accent)' }}
                        >
                          {u.first_name[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{u.first_name}</p>
                          {u.username && (
                            <p className="text-xs text-text-dim">@{u.username}</p>
                          )}
                        </div>
                        <span className="text-[10px] text-text-dim flex-shrink-0 tabular-nums">
                          {new Date(u.created_at).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>



          {/* Sign out */}
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-danger transition-colors"
            style={{
              background: 'rgba(240,112,112,0.06)',
              border:     '0.5px solid rgba(240,112,112,0.18)',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(240,112,112,0.10)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(240,112,112,0.06)' }}
          >
            <LogOut size={15} /> {t('signOut')}
          </button>
        </div>
      </div>
    </div>
  )
}