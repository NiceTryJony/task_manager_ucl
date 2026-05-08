// 'use client'

// import { useEffect, useRef, useState } from 'react'
// import { gsap } from 'gsap'
// import { AtSign, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react'
// import { cn } from '@/lib/utils'
// import { toast } from 'sonner'

// interface Props {
//   onIdentified: (userId: number, username: string) => void
// }

// function validateUsername(v: string): string | null {
//   const clean = v.trim().replace(/^@/, '')
//   if (clean.length < 3)  return 'Minimum 3 characters'
//   if (clean.length > 32) return 'Maximum 32 characters'
//   if (!/^[a-zA-Z0-9_]+$/.test(clean)) return 'Letters, numbers and _ only'
//   return null
// }

// export function UsernameModal({ onIdentified }: Props) {
//   const [value,   setValue]   = useState('')
//   const [error,   setError]   = useState<string | null>(null)
//   const [loading, setLoading] = useState(false)
//   const [isDev]               = useState(process.env.NODE_ENV === 'development')

//   const modalRef  = useRef<HTMLDivElement>(null)
//   const overlayRef = useRef<HTMLDivElement>(null)
//   const inputRef  = useRef<HTMLInputElement>(null)

//   useEffect(() => {
//     gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.25 })
//     gsap.fromTo(modalRef.current,
//       { y: 40, opacity: 0, scale: 0.96 },
//       { y: 0,  opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(1.5)' }
//     )
//     setTimeout(() => inputRef.current?.focus(), 350)
//   }, [])

//   function handleInput(v: string) {
//     setValue(v)
//     // Clear error on type
//     if (error) setError(null)
//   }

//   async function handleSubmit() {
//     const clean = value.trim().replace(/^@/, '')
//     const validErr = validateUsername(clean)
//     if (validErr) { setError(validErr); return }

//     setLoading(true)
//     setError(null)

//     let data: any
//     try {
//       const res = await fetch('/api/users/identify', {
//         method:  'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body:    JSON.stringify({ username: clean }),
//       })
//       data = await res.json()
//       if (!res.ok || !data.user) {
//         setError(data.error ?? 'Something went wrong')
//         setLoading(false)
//         return
//       }
//     } catch (e) {
//       setError('Server error — check if identify API is deployed')
//       setLoading(false)
//       return
//     }

//     // Persist to localStorage
//     localStorage.setItem(LS_KEY_USERNAME, clean)
//     localStorage.setItem(LS_KEY_USER_ID,  String(data.user.id))

//     // Animate out
//     gsap.to(modalRef.current,  { y: 20, opacity: 0, scale: 0.95, duration: 0.2, ease: 'power2.in' })
//     gsap.to(overlayRef.current, {
//       opacity: 0, duration: 0.2, delay: 0.1,
//       onComplete: () => {
//         toast.success(data.isNew
//           ? `Welcome, @${clean}! Profile created.`
//           : `Welcome back, @${clean}!`
//         )
//         onIdentified(data.user.id, clean)
//       },
//     })
//   }

//   function handleClearDev() {
//     localStorage.removeItem(LS_KEY_USERNAME)
//     localStorage.removeItem(LS_KEY_USER_ID)
//     toast.success('localStorage cleared — reload to test')
//   }

//   const charCount = value.trim().replace(/^@/, '').length
//   const isValid   = charCount >= 3 && validateUsername(value.trim()) === null

//   return (
//     <div className="fixed inset-0 z-[200] flex items-center justify-center px-4">
//       {/* Overlay */}
//       <div ref={overlayRef} className="absolute inset-0 sheet-overlay" />

//       {/* Modal */}
//       <div ref={modalRef} className="relative w-full max-w-sm bg-bg-surface border border-bg-border rounded-3xl p-6 shadow-[0_24px_64px_rgba(0,0,0,0.6)]">
//         {/* Icon */}
//         <div className="w-14 h-14 rounded-2xl bg-accent/15 flex items-center justify-center mb-5 mx-auto animate-float">
//           <AtSign size={26} className="text-accent" />
//         </div>

//         <h2 className="text-xl font-bold text-center mb-1">Who are you?</h2>
//         <p className="text-text-secondary text-sm text-center mb-6 leading-relaxed">
//           Enter your Telegram username to sync your tasks across devices
//         </p>

//         {/* Input */}
//         <div className="relative mb-2">
//           <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-dim font-mono text-sm select-none">@</span>
//           <input
//             ref={inputRef}
//             value={value}
//             onChange={e => handleInput(e.target.value)}
//             onKeyDown={e => e.key === 'Enter' && isValid && handleSubmit()}
//             placeholder="username"
//             className={cn(
//               'input-field pl-8 font-mono text-sm',
//               error && 'border-danger/60 focus:border-danger/60 focus:ring-danger/20'
//             )}
//             maxLength={33}
//             autoComplete="off"
//             autoCapitalize="none"
//             spellCheck={false}
//           />
//         </div>

//         {/* Char counter + validation */}
//         <div className="flex items-center justify-between mb-5 px-1">
//           {error ? (
//             <span className="text-xs text-danger flex items-center gap-1">
//               <AlertCircle size={12} /> {error}
//             </span>
//           ) : isValid ? (
//             <span className="text-xs text-emerald flex items-center gap-1">
//               <CheckCircle2 size={12} /> Looks good
//             </span>
//           ) : (
//             <span className="text-xs text-text-dim">
//               {charCount < 3 ? `${3 - charCount} more chars needed` : 'Letters, numbers, _'}
//             </span>
//           )}
//           <span className="text-xs text-text-dim font-mono">{charCount}/32</span>
//         </div>

//         {/* Submit */}
//         <button
//           onClick={handleSubmit}
//           disabled={!isValid || loading}
//           className="btn-primary w-full py-3.5 text-base disabled:opacity-40 disabled:cursor-not-allowed"
//         >
//           {loading ? (
//             <span className="flex items-center justify-center gap-2">
//               <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
//               Identifying…
//             </span>
//           ) : 'Continue'}
//         </button>

//         {/* Dev helper */}
//         {isDev && (
//           <button
//             onClick={handleClearDev}
//             className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs text-text-dim hover:text-danger transition-colors py-2"
//           >
//             <Trash2 size={12} />
//             [Dev] Clear localStorage
//           </button>
//         )}

//         <p className="text-xs text-text-dim text-center mt-4 leading-relaxed">
//           Your username links your data across Telegram and browser.
//         </p>
//       </div>
//     </div>
//   )
// }

// // ── Helpers exported for use in useTelegram / page ──────────────
// export const LS_KEY_USERNAME = 'taskflow_username'
// export const LS_KEY_USER_ID  = 'taskflow_user_id'

// export function getStoredIdentity(): { userId: number; username: string } | null {
//   try {
//     const username = localStorage.getItem('taskflow_username')
//     const userIdStr = localStorage.getItem('taskflow_user_id')
//     if (!username || !userIdStr) return null
//     const userId = Number(userIdStr)
//     if (isNaN(userId)) return null
//     return { userId, username }
//   } catch {
//     return null
//   }
// }






'use client'

import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { User, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface Props {
  onIdentified: (userId: number, username: string, firstName: string) => void
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

export function UsernameModal({ onIdentified }: Props) {
  const [firstName, setFirstName] = useState('')
  const [username,  setUsername]  = useState('')
  const [fnError,   setFnError]   = useState<string | null>(null)
  const [unError,   setUnError]   = useState<string | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [isDev]                   = useState(process.env.NODE_ENV === 'development')

  const modalRef   = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const fnRef      = useRef<HTMLInputElement>(null)

  useEffect(() => {
    gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.25 })
    gsap.fromTo(modalRef.current,
      { y: 40, opacity: 0, scale: 0.96 },
      { y: 0,  opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(1.5)' }
    )
    setTimeout(() => fnRef.current?.focus(), 350)
  }, [])

  const cleanUn       = username.trim().replace(/^@/, '')
  const isFirstNameOk = validateFirstName(firstName) === null && firstName.trim().length >= 1
  const isUsernameOk  = validateUsername(username) === null && cleanUn.length >= 3
  const canSubmit     = isFirstNameOk && isUsernameOk

  async function handleSubmit() {
    const fnErr = validateFirstName(firstName)
    const unErr = validateUsername(username)
    if (fnErr) { setFnError(fnErr); return }
    if (unErr) { setUnError(unErr); return }

    setLoading(true); setFnError(null); setUnError(null)

    let data: any
    try {
      const res = await fetch('/api/users/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanUn, first_name: firstName.trim() }),
      })
      data = await res.json()
      if (!res.ok || !data.user) {
        setUnError(data.error ?? 'Something went wrong')
        setLoading(false)
        return
      }
    } catch {
      setUnError('Server error')
      setLoading(false)
      return
    }

    localStorage.setItem(LS_KEY_USERNAME,   cleanUn)
    localStorage.setItem(LS_KEY_FIRST_NAME, firstName.trim())
    localStorage.setItem(LS_KEY_USER_ID,    String(data.user.id))

    gsap.to(modalRef.current,   { y: 20, opacity: 0, scale: 0.95, duration: 0.2, ease: 'power2.in' })
    gsap.to(overlayRef.current, {
      opacity: 0, duration: 0.2, delay: 0.1,
      onComplete: () => {
        toast.success(data.isNew ? `Welcome, ${firstName.trim()}! 🎉` : `Welcome back, ${firstName.trim()}!`)
        onIdentified(data.user.id, cleanUn, firstName.trim())
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
        <h2 className="text-xl font-bold text-center mb-1">Introduce yourself</h2>
        <p className="text-text-secondary text-sm text-center mb-6 leading-relaxed">
          Enter your name and Telegram username to sync tasks across devices
        </p>

        {/* First name */}
        <div className="mb-3">
          <label className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-1.5 block">First Name</label>
          <div className="relative">
            <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-dim" />
            <input
              ref={fnRef}
              value={firstName}
              onChange={e => { setFirstName(e.target.value); if (fnError) setFnError(null) }}
              onKeyDown={e => e.key === 'Enter' && (document.getElementById('un-input') as HTMLInputElement)?.focus()}
              placeholder="Your name…"
              className={cn('input-field pl-9 text-sm', fnError && 'border-danger/60 focus:border-danger/60 focus:ring-danger/20')}
              maxLength={64}
              autoComplete="given-name"
            />
          </div>
          <div className="h-4 mt-1 px-1">
            {fnError ? (
              <span className="text-xs text-danger flex items-center gap-1"><AlertCircle size={11} /> {fnError}</span>
            ) : isFirstNameOk ? (
              <span className="text-xs text-emerald flex items-center gap-1"><CheckCircle2 size={11} /> Looks good</span>
            ) : null}
          </div>
        </div>

        {/* Username */}
        <div className="mb-5">
          <label className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-1.5 block">Telegram Username</label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-dim font-mono text-sm select-none">@</span>
            <input
              id="un-input"
              value={username}
              onChange={e => { setUsername(e.target.value); if (unError) setUnError(null) }}
              onKeyDown={e => e.key === 'Enter' && canSubmit && handleSubmit()}
              placeholder="username"
              className={cn('input-field pl-8 font-mono text-sm', unError && 'border-danger/60 focus:border-danger/60 focus:ring-danger/20')}
              maxLength={33}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </div>
          <div className="flex items-center justify-between mt-1 px-1 h-4">
            {unError ? (
              <span className="text-xs text-danger flex items-center gap-1"><AlertCircle size={11} /> {unError}</span>
            ) : isUsernameOk ? (
              <span className="text-xs text-emerald flex items-center gap-1"><CheckCircle2 size={11} /> Looks good</span>
            ) : (
              <span className="text-xs text-text-dim">
                {cleanUn.length < 3 ? `${3 - cleanUn.length} more chars needed` : 'Letters, numbers, _'}
              </span>
            )}
            <span className="text-xs text-text-dim font-mono">{cleanUn.length}/32</span>
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!canSubmit || loading}
          className="btn-primary w-full py-3.5 text-base disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Setting up…
            </span>
          ) : 'Continue'}
        </button>

        {isDev && (
          <button
            onClick={() => {
              [LS_KEY_USERNAME, LS_KEY_FIRST_NAME, LS_KEY_USER_ID].forEach(k => localStorage.removeItem(k))
              toast.success('localStorage cleared — reload to test')
            }}
            className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs text-text-dim hover:text-danger transition-colors py-2"
          >
            <Trash2 size={12} /> [Dev] Clear localStorage
          </button>
        )}

        <p className="text-xs text-text-dim text-center mt-4 leading-relaxed">
          You can change your name and username anytime in Settings.
        </p>
      </div>
    </div>
  )
}

export const LS_KEY_USERNAME   = 'taskflow_username'
export const LS_KEY_FIRST_NAME = 'taskflow_first_name'
export const LS_KEY_USER_ID    = 'taskflow_user_id'

export function getStoredIdentity(): { userId: number; username: string; firstName: string } | null {
  try {
    const username  = localStorage.getItem(LS_KEY_USERNAME)
    const firstName = localStorage.getItem(LS_KEY_FIRST_NAME) ?? username ?? ''
    const userIdStr = localStorage.getItem(LS_KEY_USER_ID)
    if (!username || !userIdStr) return null
    const userId = Number(userIdStr)
    if (isNaN(userId)) return null
    return { userId, username, firstName }
  } catch {
    return null
  }
}