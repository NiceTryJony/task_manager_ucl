'use client'

import { useEffect, useState } from 'react'
import { UserCheck, X } from 'lucide-react'
import { useI18n } from '@/lib/i18n-context'

interface Member {
  user_id: number
  users: {
    id:         number
    first_name: string
    username?:  string | null
  }
}

interface Props {
  listId:     string
  userId:     number
  assignedTo: number | null
  onChange:   (userId: number | null) => void
}

export function AssigneePicker({ listId, userId, assignedTo, onChange }: Props) {
  const { t } = useI18n()
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/lists/share?listId=${listId}&userId=${userId}`)
      .then(r => r.json())
      .then(d => { setMembers(d.members ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [listId, userId])

  if (loading) {
    return (
      <div>
        <div className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary uppercase tracking-widest mb-2.5">
          <UserCheck size={12} /> {t('assignee')}
        </div>
        <div className="flex gap-2.5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="w-10 h-10 rounded-full skeleton flex-shrink-0" />
          ))}
        </div>
      </div>
    )
  }

  if (!members.length) return null

  const assignedMember = members.find(m => m.user_id === assignedTo)

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary uppercase tracking-widest">
          <UserCheck size={12} /> {t('assignee')}
        </label>
        {assignedTo && (
          <button
            onClick={() => onChange(null)}
            className="flex items-center gap-1 text-xs text-text-dim hover:text-danger transition-colors"
          >
            <X size={10} />
            {t('unassign')}
          </button>
        )}
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {members.map(m => {
          const isSelected = assignedTo === m.user_id
          const initial    = m.users.first_name[0]?.toUpperCase() ?? '?'
          const shortName  = m.users.first_name.split(' ')[0]

          return (
            <button
              key={m.user_id}
              onClick={() => onChange(isSelected ? null : m.user_id)}
              className="flex flex-col items-center gap-1 flex-shrink-0 focus:outline-none"
              title={`${m.users.first_name}${m.users.username ? ` (@${m.users.username})` : ''}`}
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
                {shortName}
              </span>
            </button>
          )
        })}
      </div>

      {/* Assigned badge — glass, no blur (child) */}
      {assignedMember && (
        <div
          className="mt-2.5 flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{
            background: 'rgba(129,115,245,0.07)',
            border:     '0.5px solid rgba(129,115,245,0.22)',
            boxShadow:  'inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        >
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
            style={{ background: 'rgba(129,115,245,0.20)', color: 'var(--c-accent)' }}
          >
            {assignedMember.users.first_name[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-text-primary">
              {t('assignedTo')} {assignedMember.users.first_name}
            </p>
            {assignedMember.users.username && (
              <p className="text-[11px] text-text-dim">@{assignedMember.users.username}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}