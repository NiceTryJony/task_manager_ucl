'use client'

import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import {
  X, UserPlus, Check, AlertCircle, Search, Loader2,
  Crown, Pencil, Eye, Trash2, RefreshCw, ChevronDown, Bug,
} from 'lucide-react'
import { ExportPanel } from '@/components/ExportPanel'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api-client'
import { useI18n } from '@/lib/i18n-context'

interface Props {
  listId:    string
  listTitle: string
  userId:    number
  onClose:   () => void
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

function useRoleConfig() {
  const { t } = useI18n()
  return {
    owner:  { label: t('roleOwner'),  icon: <Crown  size={12} />, accent: 'rgba(245,166,35,0.85)',  bg: 'rgba(245,166,35,0.10)'  },
    editor: { label: t('roleEditor'), icon: <Pencil size={12} />, accent: 'var(--c-accent)',         bg: 'rgba(129,115,245,0.10)' },
    viewer: { label: t('roleViewer'), icon: <Eye    size={12} />, accent: 'var(--text-secondary)',   bg: 'rgba(255,255,255,0.06)' },
  }
}

// ── Reusable glass section divider ──────────────────────────
function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.07)' }} />
      <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{label}</span>
      <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.07)' }} />
    </div>
  )
}

export function ShareSheet({ listId, listTitle, userId, onClose }: Props) {
  const { t } = useI18n()
  const ROLE_CONFIG = useRoleConfig()

  const [members,        setMembers]        = useState<Member[]>([])
  const [myRole,         setMyRole]         = useState<'owner' | 'editor' | 'viewer'>('viewer')
  const [loadingMembers, setLoadingMembers] = useState(true)

  const [query,        setQuery]        = useState('')
  const [suggestions,  setSuggestions]  = useState<FoundUser[]>([])
  const [selectedUser, setSelectedUser] = useState<FoundUser | null>(null)
  const [role,         setRole]         = useState<'editor' | 'viewer'>('editor')
  const [searching,    setSearching]    = useState(false)
  const [inviting,     setInviting]     = useState(false)
  const [showSuggest,  setShowSuggest]  = useState(false)
  const [result,       setResult]       = useState<{ ok: boolean; message: string } | null>(null)

  const [changingRole, setChangingRole] = useState<number | null>(null)
  const [removingId,   setRemovingId]   = useState<number | null>(null)
  const [openRoleMenu, setOpenRoleMenu] = useState<number | null>(null)

  const [showDebug,  setShowDebug]  = useState(false)
  const [debugLines, setDebugLines] = useState<string[]>([])

  function dbg(msg: string) {
    const line = `[${new Date().toLocaleTimeString()}] ${msg}`
    console.log(line)
    setDebugLines(prev => [...prev.slice(-19), line])
  }

  const sheetRef      = useRef<HTMLDivElement>(null)
  const overlayRef    = useRef<HTMLDivElement>(null)
  const searchRef     = useRef<HTMLInputElement>(null)
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2 })
    gsap.fromTo(sheetRef.current, { y: '100%' }, { y: 0, duration: 0.35, ease: 'power3.out' })
    dbg(`Init: listId=${listId} userId=${userId}`)
    fetchMembers()
  }, [])

  function close() {
    gsap.to(sheetRef.current,   { y: '100%', duration: 0.25, ease: 'power3.in' })
    gsap.to(overlayRef.current, { opacity: 0, duration: 0.2, onComplete: onClose })
  }

  async function fetchMembers() {
    setLoadingMembers(true)
    dbg(`fetchMembers → GET /api/lists/share?listId=${listId}&userId=${userId}`)
    try {
      const res  = await apiFetch(`/api/lists/share?listId=${listId}&userId=${userId}`)
      const data = await res.json()
      dbg(`fetchMembers ← status=${res.status} members=${data.members?.length ?? 'null'} myRole=${data.myRole ?? 'null'} err=${data.error ?? 'none'}`)
      if (data.members) {
        setMembers(data.members)
        setMyRole(data.myRole)
      }
    } catch (e: any) {
      dbg(`fetchMembers ERROR: ${e?.message}`)
    }
    setLoadingMembers(false)
  }

  useEffect(() => {
    clearTimeout(searchTimeout.current)
    if (selectedUser) return
    setResult(null)

    const q = query.trim().replace(/^@/, '')
    if (!q || q.length < 1) {
      setSuggestions([])
      setShowSuggest(false)
      return
    }

    searchTimeout.current = setTimeout(async () => {
      setSearching(true)
      dbg(`search → q="${q}"`)
      try {
        const res  = await apiFetch(
          `/api/users/search?q=${encodeURIComponent(q)}&userId=${userId}&multi=true`
        )
        const data = await res.json()
        dbg(`search ← status=${res.status} users=${data.users?.length ?? 0}`)
        const memberIds = new Set(members.map(m => m.user_id))
        const filtered  = (data.users ?? []).filter((u: FoundUser) => !memberIds.has(u.id))
        setSuggestions(filtered)
        setShowSuggest(filtered.length > 0)
        if (filtered.length === 0) dbg(`search: no results for "${q}"`)
      } catch (e: any) {
        dbg(`search ERROR: ${e?.message}`)
      }
      setSearching(false)
    }, 400)

    return () => clearTimeout(searchTimeout.current)
  }, [query, members, selectedUser])

  function selectUser(u: FoundUser) {
    dbg(`selectUser: ${u.first_name} (@${u.username}) id=${u.id}`)
    setSelectedUser(u)
    setQuery(`@${u.username ?? u.id}`)
    setShowSuggest(false)
    setSuggestions([])
  }

  function clearSelection() {
    setSelectedUser(null)
    setQuery('')
    setSuggestions([])
    setResult(null)
    setTimeout(() => searchRef.current?.focus(), 50)
  }

  async function handleInvite() {
    if (!selectedUser) return
    setInviting(true); setResult(null)
    dbg(`invite → userId=${selectedUser.id} role=${role}`)
    const res  = await apiFetch('/api/lists/share', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listId, ownerId: userId, invitedUserId: selectedUser.id, role }),
    })
    const data = await res.json()
    dbg(`invite ← status=${res.status} ok=${data.ok} err=${data.error ?? 'none'}`)
    setInviting(false)
    if (data.ok) {
      toast.success(`${selectedUser.first_name} ${t('invited')}!`)
      setResult({ ok: true, message: `${selectedUser.first_name} — ${role === 'editor' ? t('roleEditor') : t('roleViewer')}` })
      clearSelection()
      fetchMembers()
    } else {
      setResult({ ok: false, message: data.error ?? t('failedToSave') })
    }
  }

  async function handleRoleChange(targetUserId: number, newRole: 'editor' | 'viewer') {
    setChangingRole(targetUserId); setOpenRoleMenu(null)
    await apiFetch('/api/lists/share', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listId, userId, targetUserId, role: newRole }),
    })
    setChangingRole(null)
    setMembers(prev => prev.map(m => m.user_id === targetUserId ? { ...m, role: newRole } : m))
    toast.success(t('roleUpdated'))
  }

  async function handleRemove(targetUserId: number, name: string) {
    setRemovingId(targetUserId)
    await apiFetch(
      `/api/lists/share?listId=${listId}&userId=${targetUserId}&requesterId=${userId}`,
      { method: 'DELETE' }
    )
    setRemovingId(null)
    setMembers(prev => prev.filter(m => m.user_id !== targetUserId))
    toast.success(`${name} ${t('removed')}`)
  }

  const canManage  = myRole === 'owner' || myRole === 'editor'
  const memberCount = members.length

  // Reusable inline styles
  const glassRow: React.CSSProperties = {
    background:   'rgba(255,255,255,0.04)',
    border:       '0.5px solid rgba(255,255,255,0.08)',
    boxShadow:    'inset 0 1px 0 rgba(255,255,255,0.05)',
    borderRadius: 18,
    padding:      '12px 14px',
  }

  const glassRowMe: React.CSSProperties = {
    background:   'rgba(129,115,245,0.07)',
    border:       '0.5px solid rgba(129,115,245,0.20)',
    boxShadow:    'inset 0 1px 0 rgba(255,255,255,0.06)',
    borderRadius: 18,
    padding:      '12px 14px',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div ref={overlayRef} className="absolute inset-0 sheet-overlay" onClick={close} />

      <div
        ref={sheetRef}
        className="relative w-full max-h-[92dvh] flex flex-col"
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

        {/* Header */}
        <div className="flex-shrink-0 px-4 pt-3 pb-4" style={{ borderBottom: '0.5px solid rgba(255,255,255,0.07)' }}>
          <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: 'rgba(255,255,255,0.12)' }} />
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">{t('shareList')}</h2>
              <p className="text-xs text-text-secondary mt-0.5">
                {memberCount} {memberCount === 1 ? t('memberSingle') : t('memberPlural')} · {t('myRoleLabel')}: <span style={{ color: 'var(--c-accent)' }}>{ROLE_CONFIG[myRole].label}</span>
              </p>
            </div>
            <div className="flex items-center gap-1">
              {process.env.NODE_ENV === 'development' && (
                <button
                  onClick={() => setShowDebug(v => !v)}
                  className={cn('btn-ghost p-2', showDebug && 'text-amber bg-amber/10')}
                  title="Debug"
                >
                  <Bug size={16} />
                </button>
              )}
              <button onClick={close} className="btn-ghost p-2"><X size={18} /></button>
            </div>
          </div>
        </div>

        <div className="flex-1 scrollable px-4 py-4 space-y-5">

          {/* Debug panel */}
          {showDebug && (
            <div
              className="rounded-2xl p-3 space-y-1"
              style={{
                background: 'rgba(10,10,20,0.85)',
                border:     '0.5px solid rgba(245,166,35,0.20)',
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-amber uppercase tracking-widest">Debug Log</p>
                <button onClick={() => setDebugLines([])} className="text-xs text-text-dim hover:text-text-secondary">clear</button>
              </div>
              {debugLines.length === 0
                ? <p className="text-xs text-text-dim font-mono">No logs yet</p>
                : debugLines.map((l, i) => (
                  <p key={i} className="text-[10px] text-text-secondary font-mono leading-relaxed break-all">{l}</p>
                ))
              }
              <div className="pt-2 space-y-1" style={{ borderTop: '0.5px solid rgba(255,255,255,0.07)' }}>
                <p className="text-[10px] font-mono text-text-dim">listId: {listId}</p>
                <p className="text-[10px] font-mono text-text-dim">userId: {userId}</p>
                <p className="text-[10px] font-mono text-text-dim">myRole: {myRole}</p>
                <p className="text-[10px] font-mono text-text-dim">suggestions: {suggestions.length}</p>
                <p className="text-[10px] font-mono text-text-dim">selected: {selectedUser ? `${selectedUser.first_name} (${selectedUser.id})` : 'none'}</p>
              </div>
            </div>
          )}

          {/* Members */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-widest">{t('whoHasAccess')}</p>
              <button onClick={fetchMembers} className="text-text-dim hover:text-accent transition-colors p-1">
                <RefreshCw size={13} />
              </button>
            </div>

            {loadingMembers ? (
              <div className="space-y-2">
                {[...Array(2)].map((_, i) => <div key={i} className="h-14 skeleton rounded-2xl" />)}
              </div>
            ) : members.length === 0 ? (
              <div
                className="flex items-center gap-2 p-3 rounded-xl"
                style={{ background: 'rgba(245,166,35,0.07)', border: '0.5px solid rgba(245,166,35,0.18)' }}
              >
                <AlertCircle size={14} className="text-amber flex-shrink-0" />
                <span className="text-xs text-text-secondary">{t('noMembersDebug')}</span>
              </div>
            ) : (
              <div className="space-y-2">
                {members.map(m => {
                  const cfg  = ROLE_CONFIG[m.role]
                  const isMe = m.user_id === userId
                  const isOwn= m.role === 'owner'
                  return (
                    <div key={m.user_id} className="flex items-center gap-3" style={isMe ? glassRowMe : glassRow}>
                      {/* Avatar */}
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                        style={isMe
                          ? { background: 'rgba(129,115,245,0.20)', color: 'var(--c-accent)' }
                          : { background: 'rgba(255,255,255,0.07)', color: 'var(--text-secondary)' }
                        }
                      >
                        {m.users.first_name[0]?.toUpperCase()}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium truncate">{m.users.first_name}</p>
                          {isMe && (
                            <span
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                              style={{ background: 'rgba(129,115,245,0.15)', color: 'var(--c-accent)' }}
                            >
                              you
                            </span>
                          )}
                        </div>
                        {m.users.username && (
                          <p className="text-xs text-text-dim">@{m.users.username}</p>
                        )}
                      </div>

                      {/* Role badge / dropdown */}
                      <div className="relative flex-shrink-0">
                        {!isOwn && myRole === 'owner' ? (
                          <button
                            onClick={() => setOpenRoleMenu(openRoleMenu === m.user_id ? null : m.user_id)}
                            disabled={changingRole === m.user_id}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all hover:opacity-80 active:scale-95"
                            style={{ background: cfg.bg, color: cfg.accent }}
                          >
                            {changingRole === m.user_id ? <Loader2 size={11} className="animate-spin" /> : cfg.icon}
                            {cfg.label}
                            <ChevronDown size={10} />
                          </button>
                        ) : (
                          <span
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold"
                            style={{ background: cfg.bg, color: cfg.accent }}
                          >
                            {cfg.icon}{cfg.label}
                          </span>
                        )}

                        {/* Role dropdown */}
                        {openRoleMenu === m.user_id && (
                          <div
                            className="absolute right-0 top-full mt-1 z-20 overflow-hidden"
                            style={{
                              minWidth:            130,
                              borderRadius:        14,
                              background:          'var(--dropdown-bg)',
                              backdropFilter:      'var(--glass-blur)',
                              WebkitBackdropFilter:'var(--glass-blur)',
                              border:              '0.5px solid var(--dropdown-border)',
                              boxShadow:           'var(--dropdown-shadow)',
                            }}
                          >
                            {(['editor', 'viewer'] as const).map(r => {
                              const rc = ROLE_CONFIG[r]
                              return (
                                <button
                                  key={r}
                                  onClick={() => handleRoleChange(m.user_id, r)}
                                  className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-left transition-colors"
                                  style={{
                                    color:      m.role === r ? rc.accent : 'var(--text-secondary)',
                                    background: m.role === r ? rc.bg : 'transparent',
                                  }}
                                  onMouseEnter={e => { if (m.role !== r) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}
                                  onMouseLeave={e => { if (m.role !== r) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                                >
                                  {rc.icon}{rc.label}
                                  {m.role === r && <Check size={11} className="ml-auto" />}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>

                      {!isOwn && !isMe && myRole === 'owner' && (
                        <button
                          onClick={() => handleRemove(m.user_id, m.users.first_name)}
                          disabled={removingId === m.user_id}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-text-dim hover:text-danger transition-all flex-shrink-0"
                          style={{ background: 'transparent' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(240,112,112,0.10)' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                        >
                          {removingId === m.user_id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Invite section */}
          {canManage && (
            <>
              <SectionDivider label={t('inviteSomeone')} />

              <div className="space-y-3">
                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
                    {searching
                      ? <Loader2 size={15} className="animate-spin" style={{ color: 'var(--c-accent)' }} />
                      : <Search size={15} style={{ color: 'var(--text-dim)' }} />}
                  </div>
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={e => { setQuery(e.target.value); setSelectedUser(null) }}
                    placeholder={t('typeUsername')}
                    className="input-field pl-10 pr-9 text-sm"
                    style={selectedUser
                      ? { borderColor: 'rgba(129,115,245,0.40)', background: 'rgba(129,115,245,0.06)' }
                      : {}
                    }
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    data-form-type="other"
                    type="search"
                  />
                  {query && (
                    <button onClick={clearSelection} className="absolute right-3 top-1/2 -translate-y-1/2 z-10 text-text-dim hover:text-text-secondary">
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Suggestions dropdown */}
                {showSuggest && suggestions.length > 0 && (
                  <div
                    className="overflow-hidden"
                    style={{
                      borderRadius:        16,
                      background:          'var(--dropdown-bg)',
                      backdropFilter:      'var(--glass-blur)',
                      WebkitBackdropFilter:'var(--glass-blur)',
                      border:              '0.5px solid rgba(129,115,245,0.22)',
                      boxShadow:           'var(--dropdown-shadow)',
                    }}
                  >
                    <p
                      className="text-[10px] px-3 pt-2 pb-1 uppercase tracking-widest font-semibold"
                      style={{ color: 'var(--text-dim)' }}
                    >
                      {t('foundInDatabase')}
                    </p>
                    {suggestions.map((u, i) => (
                      <button
                        key={u.id}
                        onPointerDown={e => { e.preventDefault(); selectUser(u) }}
                        className="w-full flex items-center gap-3 px-3.5 py-3 text-left transition-colors"
                        style={{ borderTop: i > 0 ? '0.5px solid rgba(255,255,255,0.07)' : 'none' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                      >
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                          style={{ background: 'rgba(255,255,255,0.07)', color: 'var(--text-secondary)' }}
                        >
                          {u.first_name[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{u.first_name}</p>
                          {u.username && <p className="text-xs text-text-dim font-mono">@{u.username}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Not found */}
                {!searching && query.trim().replace(/^@/, '').length >= 2 && suggestions.length === 0 && !selectedUser && (
                  <div
                    className="flex items-center gap-2 p-3 rounded-xl"
                    style={{ background: 'rgba(245,166,35,0.07)', border: '0.5px solid rgba(245,166,35,0.18)' }}
                  >
                    <AlertCircle size={14} className="text-amber flex-shrink-0" />
                    <span className="text-xs text-text-secondary">{t('notFound')}</span>
                  </div>
                )}

                {/* Selected user */}
                {selectedUser && (
                  <div
                    className="flex items-center gap-3 px-3.5 py-3 rounded-2xl"
                    style={{
                      background: 'rgba(129,115,245,0.08)',
                      border:     '0.5px solid rgba(129,115,245,0.22)',
                      boxShadow:  'inset 0 1px 0 rgba(255,255,255,0.06)',
                    }}
                  >
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                      style={{ background: 'rgba(129,115,245,0.18)', color: 'var(--c-accent)' }}
                    >
                      {selectedUser.first_name[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{selectedUser.first_name}</p>
                      {selectedUser.username && <p className="text-xs text-text-dim font-mono">@{selectedUser.username}</p>}
                    </div>
                    <Check size={15} className="text-emerald flex-shrink-0" />
                  </div>
                )}

                {/* Role selector */}
                <div className="flex gap-2">
                  {(['editor', 'viewer'] as const).map(r => {
                    const rc = ROLE_CONFIG[r]
                    const active = role === r
                    return (
                      <button
                        key={r}
                        onClick={() => setRole(r)}
                        className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-1.5"
                        style={active
                          ? { background: rc.bg, color: rc.accent, border: `0.5px solid ${rc.accent}44`, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }
                          : { background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.09)', color: 'var(--text-secondary)' }
                        }
                      >
                        {rc.icon}
                        {r === 'editor' ? t('canEdit') : t('viewOnlyRole')}
                      </button>
                    )
                  })}
                </div>

                {/* Result feedback */}
                {result && (
                  <div
                    className="flex items-center gap-2 p-3 rounded-xl text-sm"
                    style={result.ok
                      ? { background: 'rgba(62,207,142,0.08)', border: '0.5px solid rgba(62,207,142,0.22)', color: 'var(--c-emerald)' }
                      : { background: 'rgba(240,112,112,0.08)', border: '0.5px solid rgba(240,112,112,0.22)', color: 'var(--c-danger)'  }
                    }
                  >
                    {result.ok ? <Check size={15} /> : <AlertCircle size={15} />}
                    {result.message}
                  </div>
                )}

                <button
                  onClick={handleInvite}
                  disabled={!selectedUser || inviting}
                  className="btn-primary w-full py-3.5 flex items-center justify-center gap-2 disabled:opacity-35"
                >
                  {inviting ? <Loader2 size={17} className="animate-spin" /> : <UserPlus size={17} />}
                  {inviting ? t('inviting') : selectedUser ? `${t('inviteBtn')} ${selectedUser.first_name}` : t('selectUserFirst')}
                </button>
              </div>
            </>
          )}

          <ExportPanel
            listId={listId}
            userId={userId}
            listTitle={listTitle}
          />
        </div>
      </div>
    </div>
  )
}