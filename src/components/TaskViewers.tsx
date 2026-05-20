'use client'

/**
 * TaskViewers — компонент "кто видел задачу"
 *
 * Оптимизации:
 * - Монтируется только когда попадает во viewport (IntersectionObserver)
 * - Данные загружаются один раз при первом появлении
 * - Realtime subscription на task_views для текущей задачи
 * - React.memo — не ре-рендерится при изменениях родителя
 */

import { useEffect, useRef, useState, memo, useCallback } from 'react'
import { Eye, EyeOff, ChevronDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { apiFetch } from '@/lib/api-client'

interface Viewer {
  user_id:   number
  viewed_at: string
  user: {
    id:         number
    first_name: string
    username?:  string | null
  }
}

interface Props {
  taskId:       string
  userId:       number   // текущий пользователь — записываем просмотр
  memberCount?: number   // общее кол-во участников списка (для "X из Y видели")
}

// ── Аватарные цвета — циклические ────────────────────────────
const AVATAR_COLORS = [
  { bg: 'rgba(62,207,142,0.15)',   color: 'var(--c-emerald)' },
  { bg: 'rgba(129,115,245,0.15)',  color: 'var(--c-accent)'  },
  { bg: 'rgba(245,166,35,0.15)',   color: 'var(--c-amber)'   },
  { bg: 'rgba(232,121,160,0.15)',  color: 'var(--c-pink)'    },
  { bg: 'rgba(96,165,250,0.15)',   color: '#60A5FA'           },
]

function timeAgo(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(mins / 60)
  const days  = Math.floor(hours / 24)
  if (mins  < 1)  return 'just now'
  if (mins  < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days  < 7)  return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Внутренний компонент — монтируется только при visible ─────
const TaskViewersInner = memo(function TaskViewersInner({
  taskId, userId, memberCount,
}: Props) {
  const [viewers,  setViewers]  = useState<Viewer[]>([])
  const [loading,  setLoading]  = useState(true)
  const [expanded, setExpanded] = useState(false)

  // Загружаем viewers
  const load = useCallback(async () => {
    try {
      const res  = await apiFetch(`/api/tasks/views?taskId=${taskId}`)
      const data = await res.json()
      setViewers(data.views ?? [])
    } catch {}
    setLoading(false)
  }, [taskId])

  // Записываем просмотр текущего пользователя (fire-and-forget)
  useEffect(() => {
    apiFetch('/api/tasks/views', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId }),
    }).catch(() => {})
  }, [taskId])

  // Первичная загрузка
  useEffect(() => { load() }, [load])

  // Realtime — обновляем список когда кто-то ещё открыл задачу
  useEffect(() => {
    const channel = supabase
      .channel(`task-views-${taskId}`)
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'task_views', filter: `task_id=eq.${taskId}` },
        () => { load() }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [taskId, load])

  const MAX_SHOWN = 3
  const visibleViewers  = viewers.slice(0, expanded ? viewers.length : MAX_SHOWN)
  const hiddenCount     = Math.max(0, viewers.length - MAX_SHOWN)
  const currentUserSeen = viewers.some(v => v.user_id === userId)

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-1">
        <div className="w-3.5 h-3.5 rounded-full skeleton flex-shrink-0" />
        <div className="h-3 w-24 skeleton rounded" />
      </div>
    )
  }

  return (
    <div>
      {/* ── Collapsed row ──────────────────────────────────── */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-2 w-full text-left group"
        style={{ touchAction: 'manipulation' }}
      >
        {/* Иконка */}
        <div
          className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
          style={{
            background: viewers.length > 0
              ? 'rgba(62,207,142,0.12)'
              : 'rgba(255,255,255,0.06)',
            border: viewers.length > 0
              ? '0.5px solid rgba(62,207,142,0.25)'
              : '0.5px solid rgba(255,255,255,0.09)',
          }}
        >
          <Eye
            size={11}
            style={{ color: viewers.length > 0 ? 'var(--c-emerald)' : 'var(--text-dim)' }}
          />
        </div>

        {/* Стек аватаров */}
        {viewers.length > 0 && (
          <div className="flex items-center" style={{ marginLeft: -2 }}>
            {viewers.slice(0, MAX_SHOWN).map((v, i) => {
              const c = AVATAR_COLORS[i % AVATAR_COLORS.length]
              return (
                <div
                  key={v.user_id}
                  title={v.user.first_name}
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                  style={{
                    background:  c.bg,
                    color:       c.color,
                    border:      '1.5px solid var(--bg-base)',
                    marginLeft:  i === 0 ? 0 : -5,
                    zIndex:      MAX_SHOWN - i,
                  }}
                >
                  {v.user.first_name[0]?.toUpperCase()}
                </div>
              )
            })}
            {hiddenCount > 0 && (
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                style={{
                  background:  'rgba(255,255,255,0.08)',
                  color:       'var(--text-dim)',
                  border:      '1.5px solid var(--bg-base)',
                  marginLeft:  -5,
                  zIndex:      0,
                }}
              >
                +{hiddenCount}
              </div>
            )}
          </div>
        )}

        {/* Текст */}
        <span className="text-[11px] flex-1 min-w-0" style={{ color: 'var(--text-dim)' }}>
          {viewers.length === 0
            ? 'No one has seen this yet'
            : viewers.length === 1
              ? `${viewers[0].user.first_name} saw this`
              : memberCount
                ? `${viewers.length} of ${memberCount} seen`
                : `${viewers.length} seen`
          }
        </span>

        {viewers.length > 0 && (
          <ChevronDown
            size={12}
            style={{
              color:     'var(--text-dim)',
              transform: expanded ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s ease',
              flexShrink: 0,
            }}
          />
        )}
      </button>

      {/* ── Expanded list ──────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateRows: expanded ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.24s ease',
        }}
      >
        <div style={{ overflow: 'hidden' }}>
          <div className="pt-2.5 space-y-2">
            {viewers.map((v, i) => {
              const c     = AVATAR_COLORS[i % AVATAR_COLORS.length]
              const isMe  = v.user_id === userId
              return (
                <div key={v.user_id} className="flex items-center gap-2.5">
                  {/* Avatar */}
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                    style={{ background: c.bg, color: c.color }}
                  >
                    {v.user.first_name[0]?.toUpperCase()}
                  </div>

                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium leading-tight truncate" style={{ color: 'var(--text-primary)' }}>
                      {v.user.first_name}
                      {isMe && (
                        <span
                          className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                          style={{ background: 'rgba(129,115,245,0.14)', color: 'var(--c-accent)' }}
                        >
                          you
                        </span>
                      )}
                    </p>
                    {v.user.username && (
                      <p className="text-[11px] leading-tight truncate" style={{ color: 'var(--text-dim)' }}>
                        @{v.user.username}
                      </p>
                    )}
                  </div>

                  {/* Time */}
                  <span className="text-[10px] flex-shrink-0 tabular-nums" style={{ color: 'var(--text-dim)' }}>
                    {timeAgo(v.viewed_at)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
})

// ── Внешний компонент — рендерит только при попадании в viewport
export const TaskViewers = memo(function TaskViewers(props: Props) {
  const ref      = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          // После первого появления — монтируем постоянно
          // (не unmount при скролле, чтобы не терять данные)
          setMounted(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1, rootMargin: '50px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref}>
      {mounted ? (
        <TaskViewersInner {...props} />
      ) : (
        // Placeholder высотой ~24px чтобы IntersectionObserver корректно работал
        <div style={{ height: 24 }} />
      )}
    </div>
  )
})