'use client'

// src/components/AssigneePicker.tsx

import { useEffect, useState } from 'react'
import { UserCheck, X } from 'lucide-react'
import { cn } from '@/lib/utils'

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
  userId:     number          // текущий пользователь (для авторизации API-запроса)
  assignedTo: number | null
  onChange:   (userId: number | null) => void
}

export function AssigneePicker({ listId, userId, assignedTo, onChange }: Props) {
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
          <UserCheck size={12} /> Assignee
        </div>
        <div className="flex gap-2.5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="w-10 h-10 rounded-full skeleton flex-shrink-0" />
          ))}
        </div>
      </div>
    )
  }

  // Нет участников (редкий кейс — список только у owner'а без шаринга)
  if (!members.length) return null

  const assignedMember = members.find(m => m.user_id === assignedTo)

  return (
    <div>
      {/* Label row */}
      <div className="flex items-center justify-between mb-2.5">
        <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary uppercase tracking-widest">
          <UserCheck size={12} /> Assignee
        </label>
        {assignedTo && (
          <button
            onClick={() => onChange(null)}
            className="flex items-center gap-1 text-xs text-text-dim hover:text-danger transition-colors"
          >
            <X size={10} />
            Unassign
          </button>
        )}
      </div>

      {/* Avatar scroll */}
      <div
        className="flex gap-3 overflow-x-auto pb-1"
        style={{ scrollbarWidth: 'none' }}
      >
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
              <div className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-200',
                isSelected
                  ? 'bg-accent text-white ring-2 ring-accent ring-offset-2 ring-offset-bg-surface scale-110'
                  : 'bg-bg-hover text-text-secondary hover:bg-bg-border active:scale-95'
              )}>
                {initial}
              </div>
              <span className={cn(
                'text-[10px] max-w-[40px] truncate leading-tight',
                isSelected ? 'text-accent font-semibold' : 'text-text-dim'
              )}>
                {shortName}
              </span>
            </button>
          )
        })}
      </div>

      {/* Selected user confirmation chip */}
      {assignedMember && (
        <div className="mt-2.5 flex items-center gap-2 px-3 py-2 bg-accent/5 border border-accent/20 rounded-xl">
          <div className="w-6 h-6 rounded-full bg-accent/25 text-accent flex items-center justify-center text-xs font-bold flex-shrink-0">
            {assignedMember.users.first_name[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-text-primary">
              Assigned to {assignedMember.users.first_name}
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