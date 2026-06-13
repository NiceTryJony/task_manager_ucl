'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { UserCheck, X, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n-context'
import type { TaskAssignee } from '@/types'
import { apiFetch } from '@/lib/api-client'
import { useTaskStore, type ListMember } from '@/lib/store'



interface Props {
  listId:      string
  userId:      number            // current user — shown first
  assignedTo:  number[]          // selected IDs
  onChange:    (ids: number[]) => void
  delayFetch?: number  // ← новый проп
}

// ── Avatar chip (selected badge row) ─────────────────────────

function AssigneeChip({
  user,
  onRemove,
}: {
  user:     TaskAssignee
  onRemove: () => void
}) {
  const initial = user.first_name[0]?.toUpperCase() ?? '?'
  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium animate-fade-up"
      style={{
        background: 'rgba(129,115,245,0.12)',
        border:     '0.5px solid rgba(129,115,245,0.28)',
        color:      'var(--c-accent)',
        flexShrink: 0,
      }}
    >
      <div
        className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
        style={{ background: 'rgba(129,115,245,0.25)', color: 'var(--c-accent)' }}
      >
        {initial}
      </div>
      <span className="max-w-[64px] truncate">{user.first_name}</span>
      <button
        onClick={onRemove}
        className="transition-colors hover:text-danger flex-shrink-0"
        style={{ touchAction: 'manipulation' }}
        aria-label={`Remove ${user.first_name}`}
      >
        <X size={11} />
      </button>
    </div>
  )
}

// ── Avatar circle (scroll row) ────────────────────────────────

function MemberAvatar({
  member,
  isSelected,
  isSelf,
  onClick,
}: {
  member:     ListMember
  isSelected: boolean
  isSelf:     boolean
  onClick:    () => void
}) {
  const initial   = member.users.first_name[0]?.toUpperCase() ?? '?'
  const shortName = member.users.first_name.split(' ')[0]

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 flex-shrink-0 focus:outline-none relative"
      title={`${member.users.first_name}${member.users.username ? ` (@${member.users.username})` : ''}${isSelf ? ' (you)' : ''}`}
      style={{ touchAction: 'manipulation' }}
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-200"
        style={isSelected
          ? {
              background:  'var(--c-accent)',
              color:       '#fff',
              boxShadow:   '0 0 0 2px var(--c-accent), 0 0 0 4px rgba(129,115,245,0.20)',
              transform:   'scale(1.10)',
            }
          : {
              background:  'rgba(255,255,255,0.06)',
              border:      '0.5px solid rgba(255,255,255,0.09)',
              boxShadow:   'inset 0 1px 0 rgba(255,255,255,0.07)',
              color:       'var(--text-secondary)',
            }
        }
      >
        {initial}
      </div>
      <span
        className="text-[10px] max-w-[40px] truncate leading-tight"
        style={{ color: isSelected ? 'var(--c-accent)' : 'var(--text-dim)' }}
      >
        {isSelf ? 'You' : shortName}
      </span>
      {isSelected && (
        <div
          className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center"
          style={{ background: 'var(--c-emerald)', border: '1.5px solid var(--bg-base)' }}
        >
          <svg width="7" height="6" viewBox="0 0 7 6" fill="none">
            <path d="M1 3L2.8 4.8L6 1.2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </button>
  )
}

// ── Main component ────────────────────────────────────────────

export function AssigneePicker({ listId, userId, assignedTo, onChange, delayFetch = 0 }: Props) {
  const { t } = useI18n()

  const cached          = useTaskStore(s => s.membersCache[listId])
  const [members, setMembers] = useState<ListMember[]>(cached ?? [])
  const [loading, setLoading] = useState(!cached)
  const [error,    setError]    = useState(false)
  const [query,    setQuery]    = useState('')
  const [canFade,  setCanFade]  = useState(false)   // show right-side fade gradient

  const abortRef   = useRef<AbortController>()
  const scrollRef  = useRef<HTMLDivElement>(null)

  // ── Fetch members with AbortController ──────────────────────
  const loadMembers = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setLoading(true)
    setError(false)

    apiFetch(`/api/lists/share?listId=${listId}&userId=${userId}`, {
      signal: abortRef.current.signal,
    })
      .then(r => r.json())
      .then(d => {
        const raw: ListMember[] = d.members ?? []
        const sorted = [
          ...raw.filter(m => m.user_id === userId),
          ...raw.filter(m => m.user_id !== userId),
        ]
        setMembers(sorted)
        useTaskStore.getState().setMembersCache(listId, sorted)
        setLoading(false)
      })
      .catch(err => {
        if (err.name === 'AbortError') return
        setError(true)
        setLoading(false)
      })
  }, [listId, userId]) // setMembersCache убран — читается через getState()

  // useEffect(() => {
  //   loadMembers()
  //   return () => abortRef.current?.abort()
    
  // }, [loadMembers])

  useEffect(() => {
    if (cached && cached.length > 0) return  // ← кеш есть — не фетчим вообще

    const t = setTimeout(loadMembers, delayFetch)
    return () => {
      clearTimeout(t)
      abortRef.current?.abort()
    }
  }, [loadMembers, cached, delayFetch])

  // ── Detect if scroll container overflows (to show fade) ──────
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const check = () => setCanFade(el.scrollWidth > el.clientWidth)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [members])

  // ── Toggle selection ─────────────────────────────────────────
  function toggle(id: number) {
    if (assignedTo.includes(id)) {
      onChange(assignedTo.filter(x => x !== id))
    } else {
      onChange([...assignedTo, id])
    }
  }

  // ── Filtered list ────────────────────────────────────────────
  const filtered = query.trim()
    ? members.filter(m =>
        m.users.first_name.toLowerCase().includes(query.toLowerCase()) ||
        (m.users.username ?? '').toLowerCase().includes(query.toLowerCase())
      )
    : members

  const selectedUsers = assignedTo
    .map(id => members.find(m => m.user_id === id)?.users)
    .filter(Boolean) as TaskAssignee[]

  const labelSuffix = assignedTo.length > 1 ? ` · ${assignedTo.length}` : ''

  // ── Loading skeleton ─────────────────────────────────────────
  if (loading) {
    return (
      <div>
        <div className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary uppercase tracking-widest mb-2.5">
          <UserCheck size={12} /> {t('assignee')}
        </div>
        <div className="flex gap-2.5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="w-10 h-10 rounded-full skeleton flex-shrink-0" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <div className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary uppercase tracking-widest mb-2">
          <UserCheck size={12} /> {t('assignee')}
        </div>
        <button
          onClick={loadMembers}
          className="text-xs text-text-dim hover:text-accent transition-colors"
        >
          {t('retry')} ↺
        </button>
      </div>
    )
  }

  if (!members.length) return null

  return (
    <div>
      {/* Label row */}
      <div className="flex items-center justify-between mb-2.5">
        <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary uppercase tracking-widest">
          <UserCheck size={12} />
          {t('assignee')}{labelSuffix}
        </label>
        {assignedTo.length > 0 && (
          <button
            onClick={() => onChange([])}
            className="flex items-center gap-1 text-xs text-text-dim hover:text-danger transition-colors"
          >
            <X size={10} /> {t('unassign')}
          </button>
        )}
      </div>

      {/* Search (visible when 5+ members) */}
      {members.length >= 5 && (
        <div className="relative mb-3">
          <Search
            size={12}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--text-dim)' }}
          />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Filter members…"
            className="input-field pl-8 py-1.5 text-xs"
            autoComplete="off"
          />
        </div>
      )}

      {/* Scroll row with fade gradient */}
      <div className="relative">
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto pb-1"
          style={{ scrollbarWidth: 'none' }}
        >
          {filtered.map(m => (
            <MemberAvatar
              key={m.user_id}
              member={m}
              isSelected={assignedTo.includes(m.user_id)}
              isSelf={m.user_id === userId}
              onClick={() => toggle(m.user_id)}
            />
          ))}
          {filtered.length === 0 && (
            <p className="text-xs text-text-dim py-2">No members match</p>
          )}
        </div>

        {/* Right fade gradient — shown when content overflows */}
        {canFade && (
          <div
            className="absolute right-0 top-0 bottom-1 w-8 pointer-events-none"
            style={{
              background: 'linear-gradient(to right, transparent, var(--bg-base))',
            }}
          />
        )}
      </div>

      {/* Selected badge row */}
      {selectedUsers.length > 0 && (
        <div
          className="mt-3 p-2.5 rounded-xl flex flex-wrap gap-1.5"
          style={{
            background: 'rgba(129,115,245,0.05)',
            border:     '0.5px solid rgba(129,115,245,0.18)',
            boxShadow:  'inset 0 1px 0 rgba(255,255,255,0.04)',
          }}
        >
          {selectedUsers.map(user => (
            <AssigneeChip
              key={user.id}
              user={user}
              onRemove={() => toggle(user.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}