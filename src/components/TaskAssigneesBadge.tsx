'use client'

import { useState } from 'react'
import { ChevronDown, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TaskAssignee } from '@/types'
import { useI18n } from '@/lib/i18n-context'

// ── Colour palette for avatars (cycles by index) ──────────────
const AVATAR_COLORS = [
  { bg: 'rgba(129,115,245,0.18)', color: 'var(--c-accent)'   },   // purple
  { bg: 'rgba(62,207,142,0.18)',  color: 'var(--c-emerald)'  },   // green
  { bg: 'rgba(245,166,35,0.18)',  color: 'var(--c-amber)'    },   // amber
  { bg: 'rgba(232,121,160,0.18)', color: 'var(--c-pink)'     },   // pink
  { bg: 'rgba(96,165,250,0.18)',  color: '#60A5FA'            },   // blue
]

function avatarStyle(idx: number) {
  return AVATAR_COLORS[idx % AVATAR_COLORS.length]
}

// ── Props ─────────────────────────────────────────────────────

interface Props {
  assignees:  TaskAssignee[]
  currentUserId?: number
  /** Max avatars shown in collapsed row before "+N" */
  maxVisible?: number
  className?: string
}

// ─────────────────────────────────────────────────────────────

export function TaskAssigneesBadge({
  assignees,
  currentUserId,
  maxVisible = 3,
  className,
}: Props) {
  const [open, setOpen] = useState(false)

  if (!assignees.length) return null

  // Current user first
  const sorted = [
    ...assignees.filter(a => a.id === currentUserId),
    ...assignees.filter(a => a.id !== currentUserId),
  ]

  const visible  = sorted.slice(0, maxVisible)
  const overflow = sorted.length - maxVisible   // how many hidden in collapsed

  return (
    <div className={cn('', className)}>

      {/* ── Collapsed row ────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span
            className="text-[10px] font-medium uppercase tracking-wider"
            style={{ color: 'var(--text-dim)', letterSpacing: '0.06em' }}
          >
            t('respond'):
          </span>

          {/* Stacked avatars */}
          <div className="flex items-center">
            {visible.map((a, idx) => {
              const style = avatarStyle(sorted.indexOf(a))
              return (
                <div
                  key={a.id}
                  title={`${a.first_name}${a.username ? ` (@${a.username})` : ''}`}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 transition-transform duration-150 hover:scale-110"
                  style={{
                    background:  style.bg,
                    color:       style.color,
                    border:      '1.5px solid var(--bg-base)',
                    marginLeft:  idx === 0 ? 0 : -6,
                    zIndex:      visible.length - idx,
                  }}
                >
                  {a.first_name[0]?.toUpperCase()}
                </div>
              )
            })}

            {/* +N overflow pill */}
            {overflow > 0 && (
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                style={{
                  background:  'rgba(255,255,255,0.08)',
                  border:      '1.5px solid var(--bg-base)',
                  color:       'var(--text-secondary)',
                  marginLeft:  -6,
                  zIndex:      0,
                }}
              >
                +{overflow}
              </div>
            )}
          </div>
        </div>

        {/* Toggle chevron */}
        <button
          onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
          aria-label={open ? 'Сховати виконавців' : 'Показати виконавців'}
          className="w-5 h-5 rounded-full flex items-center justify-center transition-all duration-200 active:scale-90 flex-shrink-0"
          style={{
            background: open
              ? 'rgba(129,115,245,0.15)'
              : 'rgba(255,255,255,0.06)',
            border: open
              ? '0.5px solid rgba(129,115,245,0.30)'
              : '0.5px solid rgba(255,255,255,0.10)',
            touchAction: 'manipulation',
          }}
        ></button>
      </div>

      {/* ── Expanded list ─────────────────────────────────────── */}
      <div
        style={{
          display:    'grid',
          gridTemplateRows: open ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.26s ease',
        }}
      >
        <div style={{ overflow: 'hidden' }}>
          <div className="pt-2.5 flex flex-col gap-2">
            {sorted.map((a, idx) => {
              const style  = avatarStyle(idx)
              const isSelf = a.id === currentUserId

              return (
                <div key={a.id} className="flex items-center gap-2.5">
                  {/* Avatar */}
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                    style={{ background: style.bg, color: style.color }}
                  >
                    {a.first_name[0]?.toUpperCase()}
                  </div>

                  {/* Name + username */}
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-[13px] font-medium leading-tight truncate"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {a.first_name}
                    </p>
                    {a.username && (
                      <p
                        className="text-[11px] leading-tight truncate"
                        style={{ color: 'var(--text-dim)' }}
                      >
                        @{a.username}
                      </p>
                    )}
                  </div>

                  {/* "you" badge */}
                  {isSelf && (
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                      style={{
                        background: 'rgba(129,115,245,0.14)',
                        color:      'var(--c-accent)',
                      }}
                    >
                      ти
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

    </div>
  )
}