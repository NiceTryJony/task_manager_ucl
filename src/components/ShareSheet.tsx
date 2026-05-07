'use client'

import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { X, UserPlus, Check, AlertCircle, Search, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface Props {
  listId:  string
  userId:  number
  onClose: () => void
}

interface FoundUser {
  id: number
  first_name: string
  username?: string
}

export function ShareSheet({ listId, userId, onClose }: Props) {
  const [query,    setQuery]    = useState('')
  const [role,     setRole]     = useState<'editor' | 'viewer'>('editor')
  const [loading,  setLoading]  = useState(false)
  const [searching, setSearching] = useState(false)
  const [found,    setFound]    = useState<FoundUser | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [result,   setResult]   = useState<{ ok: boolean; message: string } | null>(null)

  const sheetRef   = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2 })
    gsap.fromTo(sheetRef.current, { y: '100%' }, { y: 0, duration: 0.35, ease: 'power3.out' })
  }, [])

  function close() {
    gsap.to(sheetRef.current,   { y: '100%', duration: 0.25, ease: 'power3.in' })
    gsap.to(overlayRef.current, { opacity: 0, duration: 0.2, onComplete: onClose })
  }

  // Auto-search as user types (debounced)
  useEffect(() => {
    clearTimeout(searchTimeout.current)
    setFound(null)
    setNotFound(false)
    setResult(null)

    const q = query.trim().replace(/^@/, '')
    if (!q || q.length < 2) return

    searchTimeout.current = setTimeout(() => searchUser(q), 500)
    return () => clearTimeout(searchTimeout.current)
  }, [query])

  async function searchUser(q: string) {
    setSearching(true)
    const res  = await fetch(`/api/users/search?q=${encodeURIComponent(q)}&userId=${userId}`)
    const data = await res.json()
    setSearching(false)

    if (data.user) {
      setFound(data.user)
      setNotFound(false)
      // Animate found card in
      requestAnimationFrame(() => {
        const el = document.getElementById('found-user-card')
        if (el) gsap.fromTo(el, { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.25, ease: 'power2.out' })
      })
    } else {
      setFound(null)
      setNotFound(true)
    }
  }

  async function handleInvite() {
    if (!found) return
    if (found.id === userId) {
      setResult({ ok: false, message: "You can't invite yourself" })
      return
    }

    setLoading(true)
    setResult(null)

    const res  = await fetch('/api/lists/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listId, ownerId: userId, invitedUserId: found.id, role }),
    })
    const data = await res.json()

    if (data.ok) {
      toast.success(`${found.first_name} has been invited!`)
      setResult({ ok: true, message: `${found.first_name} can now access this list` })
      setQuery('')
      setFound(null)
    } else {
      setResult({ ok: false, message: data.error ?? 'Something went wrong' })
    }
    setLoading(false)
  }

  const inputValue = query

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div ref={overlayRef} className="absolute inset-0 sheet-overlay" onClick={close} />

      <div ref={sheetRef} className="relative w-full bg-bg-surface rounded-t-3xl border-t border-bg-border z-10 max-h-[85dvh] flex flex-col">
        {/* Handle + header */}
        <div className="flex-shrink-0 px-4 pt-3 pb-4">
          <div className="w-10 h-1 bg-bg-border rounded-full mx-auto mb-4" />
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">Share List</h2>
              <p className="text-xs text-text-secondary mt-0.5">Invite by username or Telegram ID</p>
            </div>
            <button onClick={close} className="btn-ghost p-2"><X size={18} /></button>
          </div>
        </div>

        <div className="flex-1 scrollable px-4 pb-8 space-y-4">
          {/* Search input */}
          <div className="relative">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-dim">
              {searching
                ? <Loader2 size={16} className="animate-spin text-accent" />
                : <Search size={16} />
              }
            </div>
            <input
              autoFocus
              value={inputValue}
              onChange={e => setQuery(e.target.value)}
              placeholder="@username or numeric ID…"
              className="input-field pl-10 font-mono text-sm"
            />
          </div>

          {/* Found user card */}
          {found && (
            <div id="found-user-card" className="card p-3.5 flex items-center gap-3 border border-accent/25">
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-base flex-shrink-0">
                {found.first_name[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{found.first_name}</p>
                {found.username && (
                  <p className="text-xs text-text-secondary">@{found.username}</p>
                )}
                {!found.username && (
                  <p className="text-xs text-text-dim font-mono">ID: {found.id}</p>
                )}
              </div>
              <Check size={16} className="text-emerald flex-shrink-0" />
            </div>
          )}

          {/* Not found */}
          {notFound && query.trim().length >= 2 && (
            <div className="flex items-center gap-2 text-sm text-text-secondary bg-bg-card rounded-xl p-3.5 border border-bg-border">
              <AlertCircle size={15} className="text-amber flex-shrink-0" />
              <span>User not found. They must open TaskFlow at least once.</span>
            </div>
          )}

          {/* Role selector */}
          <div>
            <label className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-2 block">
              Permission
            </label>
            <div className="flex gap-2">
              {(['editor', 'viewer'] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={cn(
                    'flex-1 py-2.5 rounded-xl text-sm font-medium transition-all duration-15',
                    role === r
                      ? 'bg-accent text-white shadow-glow-sm'
                      : 'bg-bg-card text-text-secondary hover:bg-bg-hover'
                  )}
                >
                  {r === 'editor' ? '✏️ Can edit' : '👁 View only'}
                </button>
              ))}
            </div>
          </div>

          {/* Result feedback */}
          {result && (
            <div className={cn(
              'flex items-center gap-2.5 p-3.5 rounded-xl text-sm border animate-scale-pop',
              result.ok
                ? 'bg-emerald/10 text-emerald border-emerald/20'
                : 'bg-danger/10 text-danger border-danger/20'
            )}>
              {result.ok ? <Check size={16} /> : <AlertCircle size={16} />}
              {result.message}
            </div>
          )}

          {/* Hint */}
          <p className="text-xs text-text-dim text-center leading-relaxed">
            💡 User can find their @username in Telegram profile settings
          </p>

          {/* Invite button */}
          <button
            onClick={handleInvite}
            disabled={!found || loading}
            className="btn-primary w-full py-3.5 flex items-center justify-center gap-2 disabled:opacity-35 disabled:cursor-not-allowed"
          >
            {loading
              ? <Loader2 size={18} className="animate-spin" />
              : <UserPlus size={18} />
            }
            {loading ? 'Inviting…' : found ? `Invite ${found.first_name}` : 'Find a user first'}
          </button>
        </div>
      </div>
    </div>
  )
}
