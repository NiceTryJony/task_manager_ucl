'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { gsap } from 'gsap'
import {
  X, UserPlus, Check, AlertCircle, Search, Loader2,
  Crown, Pencil, Eye, Trash2, RefreshCw, ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface Props {
  listId:  string
  userId:  number
  onClose: () => void
}

interface Member {
  role:      'owner' | 'editor' | 'viewer'
  joined_at: string
  user_id:   number
  users: {
    id:         number
    first_name: string
    username?:  string
  }
}

interface FoundUser {
  id:         number
  first_name: string
  username?:  string
}

const ROLE_CONFIG = {
  owner:  { label: 'Owner',  icon: <Crown  size={12} />, color: 'text-amber',    bg: 'bg-amber/10'   },
  editor: { label: 'Editor', icon: <Pencil size={12} />, color: 'text-accent',   bg: 'bg-accent/10'  },
  viewer: { label: 'Viewer', icon: <Eye    size={12} />, color: 'text-text-secondary', bg: 'bg-bg-hover' },
}

export function ShareSheet({ listId, userId, onClose }: Props) {
  const [members,   setMembers]   = useState<Member[]>([])
  const [myRole,    setMyRole]    = useState<'owner' | 'editor' | 'viewer'>('viewer')
  const [loadingMembers, setLoadingMembers] = useState(true)

  const [query,     setQuery]     = useState('')
  const [role,      setRole]      = useState<'editor' | 'viewer'>('editor')
  const [searching, setSearching] = useState(false)
  const [inviting,  setInviting]  = useState(false)
  const [found,     setFound]     = useState<FoundUser | null>(null)
  const [notFound,  setNotFound]  = useState(false)
  const [result,    setResult]    = useState<{ ok: boolean; message: string } | null>(null)

  const [changingRole, setChangingRole] = useState<number | null>(null)
  const [removingId,   setRemovingId]   = useState<number | null>(null)
  const [openRoleMenu, setOpenRoleMenu] = useState<number | null>(null)

  const sheetRef      = useRef<HTMLDivElement>(null)
  const overlayRef    = useRef<HTMLDivElement>(null)
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>()

  // ── Open animation ─────────────────────────────────────────
  useEffect(() => {
    gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2 })
    gsap.fromTo(sheetRef.current, { y: '100%' }, { y: 0, duration: 0.35, ease: 'power3.out' })
    fetchMembers()
  }, [])

  function close() {
    gsap.to(sheetRef.current,   { y: '100%', duration: 0.25, ease: 'power3.in' })
    gsap.to(overlayRef.current, { opacity: 0, duration: 0.2, onComplete: onClose })
  }

  // ── Fetch members ──────────────────────────────────────────
  async function fetchMembers() {
    setLoadingMembers(true)
    const res  = await fetch(`/api/lists/share?listId=${listId}&userId=${userId}`)
    const data = await res.json()
    if (data.members) {
      setMembers(data.members)
      setMyRole(data.myRole)
    }
    setLoadingMembers(false)
  }

  // ── Debounced search ───────────────────────────────────────
  useEffect(() => {
    clearTimeout(searchTimeout.current)
    setFound(null); setNotFound(false); setResult(null)

    const q = query.trim().replace(/^@/, '')
    if (!q || q.length < 2) return

    searchTimeout.current = setTimeout(async () => {
      setSearching(true)
      const res  = await fetch(`/api/users/search?q=${encodeURIComponent(q)}&userId=${userId}`)
      const data = await res.json()
      setSearching(false)

      if (data.user) {
        setFound(data.user)
        setNotFound(false)
        requestAnimationFrame(() => {
          const el = document.getElementById('found-user-card')
          if (el) gsap.fromTo(el, { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.2, ease: 'power2.out' })
        })
      } else {
        setFound(null); setNotFound(true)
      }
    }, 500)

    return () => clearTimeout(searchTimeout.current)
  }, [query])

  // ── Invite ─────────────────────────────────────────────────
  async function handleInvite() {
    if (!found) return
    if (found.id === userId) { setResult({ ok: false, message: "Can't invite yourself" }); return }
    if (members.some(m => m.user_id === found.id)) {
      setResult({ ok: false, message: 'Already a member' }); return
    }

    setInviting(true); setResult(null)
    const res  = await fetch('/api/lists/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listId, ownerId: userId, invitedUserId: found.id, role }),
    })
    const data = await res.json()
    setInviting(false)

    if (data.ok) {
      toast.success(`${found.first_name} invited!`)
      setResult({ ok: true, message: `${found.first_name} can now access this list` })
      setQuery(''); setFound(null)
      fetchMembers()
    } else {
      setResult({ ok: false, message: data.error ?? 'Something went wrong' })
    }
  }

  // ── Change role ────────────────────────────────────────────
  async function handleRoleChange(targetUserId: number, newRole: 'editor' | 'viewer') {
    setChangingRole(targetUserId); setOpenRoleMenu(null)
    await fetch('/api/lists/share', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listId, userId, targetUserId, role: newRole }),
    })
    setChangingRole(null)
    setMembers(prev => prev.map(m =>
      m.user_id === targetUserId ? { ...m, role: newRole } : m
    ))
    toast.success('Role updated')
  }

  // ── Remove member ──────────────────────────────────────────
  async function handleRemove(targetUserId: number, name: string) {
    setRemovingId(targetUserId)
    await fetch(`/api/lists/share?listId=${listId}&userId=${targetUserId}&requesterId=${userId}`, {
      method: 'DELETE',
    })
    setRemovingId(null)
    setMembers(prev => prev.filter(m => m.user_id !== targetUserId))
    toast.success(`${name} removed`)
  }

  const canManage = myRole === 'owner' || myRole === 'editor'

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div ref={overlayRef} className="absolute inset-0 sheet-overlay" onClick={close} />

      <div ref={sheetRef} className="relative w-full bg-bg-surface rounded-t-3xl border-t border-bg-border z-10 max-h-[92dvh] flex flex-col">

        {/* Handle + header */}
        <div className="flex-shrink-0 px-4 pt-3 pb-4 border-b border-bg-border/60">
          <div className="w-10 h-1 bg-bg-border rounded-full mx-auto mb-4" />
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">Share List</h2>
              <p className="text-xs text-text-secondary mt-0.5">
                {members.length} member{members.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button onClick={close} className="btn-ghost p-2"><X size={18} /></button>
          </div>
        </div>

        <div className="flex-1 scrollable px-4 py-4 space-y-5">

          {/* ── Members list ──────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-widest">
                Who has access
              </p>
              <button
                onClick={fetchMembers}
                className="text-text-dim hover:text-accent transition-colors p-1"
              >
                <RefreshCw size={13} />
              </button>
            </div>

            {loadingMembers ? (
              <div className="space-y-2">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="h-14 skeleton rounded-2xl" />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {members.map(m => {
                  const cfg     = ROLE_CONFIG[m.role]
                  const isMe    = m.user_id === userId
                  const isOwner = m.role === 'owner'
                  const initial = m.users.first_name[0]?.toUpperCase() ?? '?'

                  return (
                    <div
                      key={m.user_id}
                      className={cn(
                        'flex items-center gap-3 px-3.5 py-3 rounded-2xl border transition-all',
                        isMe
                          ? 'bg-accent/5 border-accent/20'
                          : 'bg-bg-card border-bg-border/60'
                      )}
                    >
                      {/* Avatar */}
                      <div className={cn(
                        'w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0',
                        isMe ? 'bg-accent/25 text-accent' : 'bg-bg-hover text-text-secondary'
                      )}>
                        {initial}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium truncate">{m.users.first_name}</p>
                          {isMe && (
                            <span className="text-[10px] text-accent font-semibold px-1.5 py-0.5 bg-accent/15 rounded-full flex-shrink-0">
                              you
                            </span>
                          )}
                        </div>
                        {m.users.username && (
                          <p className="text-xs text-text-dim">@{m.users.username}</p>
                        )}
                      </div>

                      {/* Role badge / changer */}
                      <div className="relative flex-shrink-0">
                        {!isOwner && myRole === 'owner' ? (
                          <button
                            onClick={() => setOpenRoleMenu(openRoleMenu === m.user_id ? null : m.user_id)}
                            disabled={changingRole === m.user_id}
                            className={cn(
                              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all',
                              cfg.color, cfg.bg,
                              'hover:opacity-80 active:scale-95'
                            )}
                          >
                            {changingRole === m.user_id
                              ? <Loader2 size={11} className="animate-spin" />
                              : cfg.icon
                            }
                            {cfg.label}
                            <ChevronDown size={10} />
                          </button>
                        ) : (
                          <span className={cn(
                            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold',
                            cfg.color, cfg.bg
                          )}>
                            {cfg.icon}
                            {cfg.label}
                          </span>
                        )}

                        {/* Role dropdown */}
                        {openRoleMenu === m.user_id && (
                          <div className="absolute right-0 top-full mt-1 z-20 bg-bg-surface border border-bg-border rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.5)] overflow-hidden"
                            style={{ minWidth: 120 }}>
                            {(['editor', 'viewer'] as const).map(r => (
                              <button
                                key={r}
                                onClick={() => handleRoleChange(m.user_id, r)}
                                className={cn(
                                  'w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium transition-colors text-left',
                                  m.role === r
                                    ? `${ROLE_CONFIG[r].color} ${ROLE_CONFIG[r].bg}`
                                    : 'text-text-secondary hover:bg-bg-hover'
                                )}
                              >
                                {ROLE_CONFIG[r].icon}
                                {ROLE_CONFIG[r].label}
                                {m.role === r && <Check size={11} className="ml-auto" />}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Remove button */}
                      {!isOwner && !isMe && myRole === 'owner' && (
                        <button
                          onClick={() => handleRemove(m.user_id, m.users.first_name)}
                          disabled={removingId === m.user_id}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-text-dim hover:text-danger hover:bg-danger/10 transition-all flex-shrink-0"
                        >
                          {removingId === m.user_id
                            ? <Loader2 size={13} className="animate-spin" />
                            : <Trash2 size={13} />
                          }
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Divider ────────────────────────────────────── */}
          {canManage && (
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-bg-border/60" />
              <span className="text-xs text-text-dim">Invite someone</span>
              <div className="flex-1 h-px bg-bg-border/60" />
            </div>
          )}

          {/* ── Invite section (owner/editor only) ─────────── */}
          {canManage && (
            <div className="space-y-3">
              {/* Search input */}
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-dim">
                  {searching
                    ? <Loader2 size={15} className="animate-spin text-accent" />
                    : <Search size={15} />
                  }
                </div>
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="@username or numeric ID…"
                  className="input-field pl-10 font-mono text-sm"
                />
                {query && (
                  <button
                    onClick={() => { setQuery(''); setFound(null); setNotFound(false) }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim hover:text-text-secondary"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Found user card */}
              {found && (
                <div id="found-user-card" className="flex items-center gap-3 px-3.5 py-3 bg-bg-card rounded-2xl border border-accent/25">
                  <div className="w-9 h-9 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-sm flex-shrink-0">
                    {found.first_name[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{found.first_name}</p>
                    {found.username && <p className="text-xs text-text-secondary">@{found.username}</p>}
                  </div>
                  <Check size={15} className="text-emerald flex-shrink-0" />
                </div>
              )}

              {/* Not found */}
              {notFound && query.trim().length >= 2 && (
                <div className="flex items-center gap-2 text-sm text-text-secondary bg-bg-card rounded-xl p-3 border border-bg-border">
                  <AlertCircle size={14} className="text-amber flex-shrink-0" />
                  <span className="text-xs">User not found — they must open TaskFlow first.</span>
                </div>
              )}

              {/* Role selector */}
              <div className="flex gap-2">
                {(['editor', 'viewer'] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => setRole(r)}
                    className={cn(
                      'flex-1 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 flex items-center justify-center gap-1.5',
                      role === r
                        ? `${ROLE_CONFIG[r].color} ${ROLE_CONFIG[r].bg} ring-1 ring-current/30`
                        : 'bg-bg-card text-text-secondary hover:bg-bg-hover'
                    )}
                  >
                    {ROLE_CONFIG[r].icon}
                    {r === 'editor' ? 'Can edit' : 'View only'}
                  </button>
                ))}
              </div>

              {/* Result feedback */}
              {result && (
                <div className={cn(
                  'flex items-center gap-2 p-3 rounded-xl text-sm border',
                  result.ok
                    ? 'bg-emerald/10 text-emerald border-emerald/20'
                    : 'bg-danger/10 text-danger border-danger/20'
                )}>
                  {result.ok ? <Check size={15} /> : <AlertCircle size={15} />}
                  {result.message}
                </div>
              )}

              {/* Invite button */}
              <button
                onClick={handleInvite}
                disabled={!found || inviting}
                className="btn-primary w-full py-3.5 flex items-center justify-center gap-2 disabled:opacity-35"
              >
                {inviting
                  ? <Loader2 size={17} className="animate-spin" />
                  : <UserPlus size={17} />
                }
                {inviting ? 'Inviting…' : found ? `Invite ${found.first_name}` : 'Find a user first'}
              </button>

              <p className="text-xs text-text-dim text-center">
                💡 Username is set in Telegram profile settings
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}