'use client'

import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import {
  X, UserPlus, Check, AlertCircle, Search, Loader2,
  Crown, Pencil, Eye, Trash2, RefreshCw, ChevronDown,
  Copy, FileText, ChevronUp, CheckCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

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

const ROLE_CONFIG = {
  owner:  { label: 'Owner',  icon: <Crown  size={12} />, color: 'text-amber',          bg: 'bg-amber/10'  },
  editor: { label: 'Editor', icon: <Pencil size={12} />, color: 'text-accent',         bg: 'bg-accent/10' },
  viewer: { label: 'Viewer', icon: <Eye    size={12} />, color: 'text-text-secondary', bg: 'bg-bg-hover'  },
}

export function ShareSheet({ listId, listTitle, userId, onClose }: Props) {
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

  const [showExport, setShowExport] = useState(false)
  const [exportText, setExportText] = useState('')
  const [loadingExp, setLoadingExp] = useState(false)
  const [copied,     setCopied]     = useState(false)

  const sheetRef      = useRef<HTMLDivElement>(null)
  const overlayRef    = useRef<HTMLDivElement>(null)
  const searchRef     = useRef<HTMLInputElement>(null)
  const suggestRef    = useRef<HTMLDivElement>(null)
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2 })
    gsap.fromTo(sheetRef.current, { y: '100%' }, { y: 0, duration: 0.35, ease: 'power3.out' })
    fetchMembers()
  }, [])

  useEffect(() => {
    function handler(e: MouseEvent | TouchEvent) {
      if (
        suggestRef.current?.contains(e.target as Node) ||
        searchRef.current?.contains(e.target as Node)
      ) return
      setShowSuggest(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [])

  function close() {
    gsap.to(sheetRef.current,   { y: '100%', duration: 0.25, ease: 'power3.in' })
    gsap.to(overlayRef.current, { opacity: 0, duration: 0.2, onComplete: onClose })
  }

  async function fetchMembers() {
    setLoadingMembers(true)
    const res  = await fetch(`/api/lists/share?listId=${listId}&userId=${userId}`)
    const data = await res.json()
    if (data.members) { setMembers(data.members); setMyRole(data.myRole) }
    setLoadingMembers(false)
  }

  // ── Autocomplete ───────────────────────────────────────────
  useEffect(() => {
    clearTimeout(searchTimeout.current)
    if (selectedUser) return
    setResult(null)

    const q = query.trim().replace(/^@/, '')
    if (!q || q.length < 1) { setSuggestions([]); setShowSuggest(false); return }

    searchTimeout.current = setTimeout(async () => {
      setSearching(true)
      const res  = await fetch(
        `/api/users/search?q=${encodeURIComponent(q)}&userId=${userId}&multi=true`
      )
      const data = await res.json()
      setSearching(false)
      const memberIds = new Set(members.map(m => m.user_id))
      const filtered  = (data.users ?? []).filter((u: FoundUser) => !memberIds.has(u.id))
      setSuggestions(filtered)
      setShowSuggest(filtered.length > 0)
    }, 300)

    return () => clearTimeout(searchTimeout.current)
  }, [query, members, selectedUser])

  function selectUser(u: FoundUser) {
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

  // ── Invite ─────────────────────────────────────────────────
  async function handleInvite() {
    if (!selectedUser) return
    setInviting(true); setResult(null)
    const res  = await fetch('/api/lists/share', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listId, ownerId: userId, invitedUserId: selectedUser.id, role }),
    })
    const data = await res.json()
    setInviting(false)
    if (data.ok) {
      toast.success(`${selectedUser.first_name} invited!`)
      setResult({ ok: true, message: `${selectedUser.first_name} added as ${role}` })
      clearSelection()
      fetchMembers()
    } else {
      setResult({ ok: false, message: data.error ?? 'Something went wrong' })
    }
  }

  // ── Role change ────────────────────────────────────────────
  async function handleRoleChange(targetUserId: number, newRole: 'editor' | 'viewer') {
    setChangingRole(targetUserId); setOpenRoleMenu(null)
    await fetch('/api/lists/share', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listId, userId, targetUserId, role: newRole }),
    })
    setChangingRole(null)
    setMembers(prev => prev.map(m => m.user_id === targetUserId ? { ...m, role: newRole } : m))
    toast.success('Role updated')
  }

  // ── Remove ─────────────────────────────────────────────────
  async function handleRemove(targetUserId: number, name: string) {
    setRemovingId(targetUserId)
    await fetch(
      `/api/lists/share?listId=${listId}&userId=${targetUserId}&requesterId=${userId}`,
      { method: 'DELETE' }
    )
    setRemovingId(null)
    setMembers(prev => prev.filter(m => m.user_id !== targetUserId))
    toast.success(`${name} removed`)
  }

  // ── Export ─────────────────────────────────────────────────
  async function handleLoadExport() {
    if (exportText) { setShowExport(v => !v); return }
    setLoadingExp(true)
    const res  = await fetch(`/api/export?listId=${listId}&userId=${userId}`)
    const text = await res.text()
    setExportText(text)
    setLoadingExp(false)
    setShowExport(true)
    requestAnimationFrame(() => {
      const el = document.getElementById('export-block')
      if (el) gsap.fromTo(el, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.25 })
    })
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(exportText)
      setCopied(true)
      toast.success('Copied!')
      setTimeout(() => setCopied(false), 2500)
    } catch {
      toast.error('Copy failed — select manually')
    }
  }

  const canManage = myRole === 'owner' || myRole === 'editor'

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div ref={overlayRef} className="absolute inset-0 sheet-overlay" onClick={close} />

      <div ref={sheetRef} className="relative w-full bg-bg-surface rounded-t-3xl border-t border-bg-border z-10 max-h-[92dvh] flex flex-col">

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

          {/* ── Members ───────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-widest">Who has access</p>
              <button onClick={fetchMembers} className="text-text-dim hover:text-accent transition-colors p-1">
                <RefreshCw size={13} />
              </button>
            </div>

            {loadingMembers ? (
              <div className="space-y-2">
                {[...Array(2)].map((_, i) => <div key={i} className="h-14 skeleton rounded-2xl" />)}
              </div>
            ) : (
              <div className="space-y-2">
                {members.map(m => {
                  const cfg   = ROLE_CONFIG[m.role]
                  const isMe  = m.user_id === userId
                  const isOwn = m.role === 'owner'
                  return (
                    <div
                      key={m.user_id}
                      className={cn(
                        'flex items-center gap-3 px-3.5 py-3 rounded-2xl border',
                        isMe ? 'bg-accent/5 border-accent/20' : 'bg-bg-card border-bg-border/60'
                      )}
                    >
                      <div className={cn(
                        'w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0',
                        isMe ? 'bg-accent/25 text-accent' : 'bg-bg-hover text-text-secondary'
                      )}>
                        {m.users.first_name[0]?.toUpperCase()}
                      </div>

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

                      <div className="relative flex-shrink-0">
                        {!isOwn && myRole === 'owner' ? (
                          <button
                            onClick={() => setOpenRoleMenu(openRoleMenu === m.user_id ? null : m.user_id)}
                            disabled={changingRole === m.user_id}
                            className={cn(
                              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold',
                              'transition-all hover:opacity-80 active:scale-95',
                              cfg.color, cfg.bg
                            )}
                          >
                            {changingRole === m.user_id
                              ? <Loader2 size={11} className="animate-spin" />
                              : cfg.icon}
                            {cfg.label}
                            <ChevronDown size={10} />
                          </button>
                        ) : (
                          <span className={cn('flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold', cfg.color, cfg.bg)}>
                            {cfg.icon}{cfg.label}
                          </span>
                        )}

                        {openRoleMenu === m.user_id && (
                          <div className="absolute right-0 top-full mt-1 z-20 bg-bg-surface border border-bg-border rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.5)] overflow-hidden" style={{ minWidth: 120 }}>
                            {(['editor', 'viewer'] as const).map(r => (
                              <button
                                key={r}
                                onClick={() => handleRoleChange(m.user_id, r)}
                                className={cn(
                                  'w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium transition-colors text-left',
                                  m.role === r ? `${ROLE_CONFIG[r].color} ${ROLE_CONFIG[r].bg}` : 'text-text-secondary hover:bg-bg-hover'
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

                      {!isOwn && !isMe && myRole === 'owner' && (
                        <button
                          onClick={() => handleRemove(m.user_id, m.users.first_name)}
                          disabled={removingId === m.user_id}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-text-dim hover:text-danger hover:bg-danger/10 transition-all flex-shrink-0"
                        >
                          {removingId === m.user_id
                            ? <Loader2 size={13} className="animate-spin" />
                            : <Trash2 size={13} />}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Invite ────────────────────────────────────── */}
          {canManage && (
            <>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-bg-border/60" />
                <span className="text-xs text-text-dim">Invite someone</span>
                <div className="flex-1 h-px bg-bg-border/60" />
              </div>

              <div className="space-y-3">
                <div className="relative">
                  <div className="relative">
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-dim pointer-events-none">
                      {searching
                        ? <Loader2 size={15} className="animate-spin text-accent" />
                        : <Search size={15} />}
                    </div>
                    <input
                      ref={searchRef}
                      value={query}
                      onChange={e => { setQuery(e.target.value); setSelectedUser(null) }}
                      onFocus={() => suggestions.length > 0 && setShowSuggest(true)}
                      placeholder="@username…"
                      className={cn(
                        'input-field pl-10 pr-9 font-mono text-sm',
                        selectedUser && 'border-accent/50 bg-accent/5'
                      )}
                      autoCapitalize="none"
                      spellCheck={false}
                    />
                    {query && (
                      <button onClick={clearSelection} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim hover:text-text-secondary">
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {showSuggest && suggestions.length > 0 && (
                    <div ref={suggestRef} className="absolute left-0 right-0 top-full mt-1 z-30 bg-bg-surface border border-bg-border rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden">
                      {suggestions.map((u, i) => (
                        <button
                          key={u.id}
                          onClick={() => selectUser(u)}
                          className={cn(
                            'w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-bg-hover',
                            i > 0 && 'border-t border-bg-border/40'
                          )}
                        >
                          <div className="w-8 h-8 rounded-full bg-bg-hover flex items-center justify-center text-xs font-bold text-text-secondary flex-shrink-0">
                            {u.first_name[0]?.toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{u.first_name}</p>
                            {u.username && <p className="text-xs text-text-dim font-mono">@{u.username}</p>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {selectedUser && (
                  <div className="flex items-center gap-3 px-3.5 py-2.5 bg-accent/5 border border-accent/25 rounded-2xl animate-fade-up">
                    <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-xs flex-shrink-0">
                      {selectedUser.first_name[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{selectedUser.first_name}</p>
                      {selectedUser.username && <p className="text-xs text-text-dim font-mono">@{selectedUser.username}</p>}
                    </div>
                    <Check size={15} className="text-emerald flex-shrink-0" />
                  </div>
                )}

                {!searching && query.trim().length >= 2 && suggestions.length === 0 && !selectedUser && (
                  <div className="flex items-center gap-2 p-3 bg-bg-card border border-bg-border rounded-xl">
                    <AlertCircle size={14} className="text-amber flex-shrink-0" />
                    <span className="text-xs text-text-secondary">No users found — they must open TaskFlow first.</span>
                  </div>
                )}

                <div className="flex gap-2">
                  {(['editor', 'viewer'] as const).map(r => (
                    <button
                      key={r}
                      onClick={() => setRole(r)}
                      className={cn(
                        'flex-1 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-1.5',
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

                {result && (
                  <div className={cn(
                    'flex items-center gap-2 p-3 rounded-xl text-sm border',
                    result.ok ? 'bg-emerald/10 text-emerald border-emerald/20' : 'bg-danger/10 text-danger border-danger/20'
                  )}>
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
                  {inviting ? 'Inviting…' : selectedUser ? `Invite ${selectedUser.first_name}` : 'Select a user first'}
                </button>
              </div>
            </>
          )}

          {/* ── Export as text ─────────────────────────────── */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-bg-border/60" />
            <span className="text-xs text-text-dim">or share as text</span>
            <div className="flex-1 h-px bg-bg-border/60" />
          </div>

          <div className="space-y-3 pb-2">
            <button
              onClick={handleLoadExport}
              disabled={loadingExp}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium bg-bg-card border border-bg-border hover:bg-bg-hover transition-colors text-text-secondary"
            >
              {loadingExp ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
              {showExport ? 'Hide' : 'Preview'} formatted text
              {showExport ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showExport && exportText && (
              <div id="export-block" className="space-y-2">
                <div className="relative">
                  <pre className="bg-bg-card border border-bg-border rounded-2xl p-4 text-xs text-text-secondary font-mono leading-relaxed overflow-x-auto max-h-52 scrollable whitespace-pre-wrap break-words">
                    {exportText}
                  </pre>
                  <div className="absolute bottom-0 left-0 right-0 h-8 rounded-b-2xl bg-gradient-to-t from-bg-card to-transparent pointer-events-none" />
                </div>
                <button
                  onClick={handleCopy}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 active:scale-95',
                    copied
                      ? 'bg-emerald/15 text-emerald border border-emerald/25'
                      : 'bg-accent text-white hover:bg-accent-hover'
                  )}
                >
                  {copied ? <CheckCheck size={16} /> : <Copy size={16} />}
                  {copied ? 'Copied!' : 'Copy to clipboard'}
                </button>
                <p className="text-xs text-text-dim text-center">Paste anywhere — Telegram, Notion, Notes…</p>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}