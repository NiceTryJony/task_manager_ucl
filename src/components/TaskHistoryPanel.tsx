'use client'

/**
 * TaskHistoryPanel — glassmorphism edition
 *
 * Performance contract:
 * ─ backdrop-filter blur только на wrapper контейнере (1 compositing layer)
 * ─ каждая HistoryEntry — нет blur, нет box-shadow с blur-radius
 * ─ useTimeAgo — один setInterval на компонент, не на каждый entry
 * ─ FIELD_LABELS / VALUE_LABELS / ACTION_CONFIG — module-level constants
 * ─ HistoryEntry + Avatar + FilterTabs — React.memo
 * ─ contain: content на каждом entry — браузер не пересчитывает layout вверх
 * ─ анимация открытия — только opacity + translateY (GPU composited)
 * ─ inline styles вместо динамических Tailwind классов для accent цветов
 */

import { useState, useMemo, useEffect, useCallback, useRef, memo } from 'react'
import { History, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import type { TaskHistory } from '@/types'
import { useI18n } from '@/lib/i18n-context'
import type { TranslationKey } from '@/lib/i18n'
import { apiFetch } from '@/lib/api-client'

// ─────────────────────────────────────────────────────────────
//  Module-level constants — zero re-creation cost
// ─────────────────────────────────────────────────────────────

const PAGE_SIZE = 15

const FIELD_LABELS: Record<string, TranslationKey> = {
  title:       'fieldTitle',
  description: 'fieldNotes',
  priority:    'fieldPriority',
  status:      'fieldStatus',
  due_at:      'fieldDueDate',
  archived:    'fieldArchived',
  subtask:     'fieldSubtask',
}

const VALUE_LABELS: Record<string, TranslationKey> = {
  todo:        'todo',
  in_progress: 'inProgress',
  done:        'done',
  low:         'low',
  medium:      'medium',
  high:        'high',
  urgent:      'urgent',
  'true':      'valYes',
  'false':     'valNo',
  'null':      'valNo',
}

// ─────────────────────────────────────────────────────────────
//  Action config
// ─────────────────────────────────────────────────────────────

type FilterGroup = 'all' | 'fields' | 'subtasks' | 'created'
type AccentKey   = 'accent' | 'emerald' | 'danger' | 'amber' | 'dim'

interface ActionCfg {
  labelKey:     TranslationKey
  altLabelKey?: TranslationKey
  showDiff:     boolean
  isCreation:   boolean
  filterGroup:  'fields' | 'subtasks' | 'created'
  accent:       AccentKey
}

const ACTION_CONFIG: Record<string, ActionCfg> = {
  field_change:      { labelKey: 'actionChangedField',      showDiff: true,  isCreation: false, filterGroup: 'fields',   accent: 'accent'  },
  subtask_added:     { labelKey: 'actionAddedSubtask',      showDiff: false, isCreation: false, filterGroup: 'subtasks', accent: 'emerald' },
  subtask_deleted:   { labelKey: 'actionRemovedSubtask',    showDiff: false, isCreation: false, filterGroup: 'subtasks', accent: 'danger'  },
  subtask_toggled:   { labelKey: 'actionCompletedSubtask',  altLabelKey: 'actionUncompletedSubtask', showDiff: false, isCreation: false, filterGroup: 'subtasks', accent: 'emerald' },
  subtask_renamed:   { labelKey: 'actionRenamedSubtask',    showDiff: true,  isCreation: false, filterGroup: 'subtasks', accent: 'amber'   },
  subtask_reordered: { labelKey: 'actionReorderedSubtasks', showDiff: false, isCreation: false, filterGroup: 'subtasks', accent: 'dim'     },
  task_created:      { labelKey: 'actionTaskCreated',       showDiff: false, isCreation: true,  filterGroup: 'created',  accent: 'emerald' },
}

const FALLBACK_CFG: ActionCfg = {
  labelKey: 'actionChangedField', showDiff: true,
  isCreation: false, filterGroup: 'fields', accent: 'accent',
}

function getActionCfg(actionType: string): ActionCfg {
  return ACTION_CONFIG[actionType] ?? FALLBACK_CFG
}

// CSS variable string per accent — avoids dynamic Tailwind classes
const ACCENT_CSS: Record<AccentKey, string> = {
  accent:  'var(--c-accent)',
  emerald: 'var(--c-emerald)',
  danger:  'var(--c-danger)',
  amber:   'var(--c-amber)',
  dim:     'rgba(255,255,255,0.18)',
}

const FILTER_TABS: { key: FilterGroup; label: string; emoji: string }[] = [
  { key: 'all',      label: 'All',      emoji: '📋' },
  { key: 'fields',   label: 'Fields',   emoji: '✏️' },
  { key: 'subtasks', label: 'Subtasks', emoji: '☑️' },
  { key: 'created',  label: 'Created',  emoji: '✨' },
]

// ─────────────────────────────────────────────────────────────
//  useTimeAgo — one interval for the whole panel
// ─────────────────────────────────────────────────────────────

function useTimeAgo() {
  const { t } = useI18n()
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  return useCallback((isoStr: string): string => {
    const diff  = Date.now() - new Date(isoStr).getTime()
    const mins  = Math.floor(diff / 60_000)
    const hours = Math.floor(mins / 60)
    const days  = Math.floor(hours / 24)
    if (mins  < 1)  return t('justNow')
    if (mins  < 60) return `${mins}${t('mAgo')}`
    if (hours < 24) return `${hours}${t('hAgo')}`
    if (days  < 7)  return `${days}${t('dAgo')}`
    return new Date(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }, [t])
}

// ─────────────────────────────────────────────────────────────
//  Avatar — memo
// ─────────────────────────────────────────────────────────────

const Avatar = memo(function Avatar({
  name,
  isCreation,
}: {
  name:       string
  isCreation: boolean
}) {
  const initial = name[0]?.toUpperCase() ?? '?'

  if (isCreation) {
    return (
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
        style={{
          background: 'rgba(62,207,142,0.12)',
          border:     '1px solid rgba(62,207,142,0.25)',
        }}
      >
        <svg
          width="12" height="12" viewBox="0 0 24 24"
          fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ color: 'var(--c-emerald)' }}
        >
          <path d="M12 3l1.9 5.8H20l-4.9 3.6 1.9 5.8L12 15l-5 3.4 1.9-5.8L4 8.8h6.1z" />
        </svg>
      </div>
    )
  }

  return (
    <div
      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-semibold"
      style={{
        background: 'rgba(255,255,255,0.06)',
        border:     '1px solid rgba(255,255,255,0.10)',
        color:      'var(--text-secondary)',
      }}
    >
      {initial}
    </div>
  )
})

// ─────────────────────────────────────────────────────────────
//  DiffBadge — no blur, alpha backgrounds only
// ─────────────────────────────────────────────────────────────

function DiffBadge({ value, variant }: { value: string; variant: 'old' | 'new' }) {
  return (
    <span
      className="inline-block text-[10px] px-2 py-0.5 rounded-full font-medium max-w-[120px] truncate"
      style={
        variant === 'old'
          ? { background: 'rgba(240,112,112,0.12)', color: 'var(--c-danger)',  textDecoration: 'line-through' }
          : { background: 'rgba(62,207,142,0.12)',  color: 'var(--c-emerald)' }
      }
    >
      {value}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────
//  DateSeparator
// ─────────────────────────────────────────────────────────────

function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 my-2 ml-9">
      <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.07)' }} />
      <span
        className="text-[9px] font-semibold uppercase tracking-widest whitespace-nowrap px-2 py-0.5 rounded-full"
        style={{
          color:      'rgba(255,255,255,0.30)',
          background: 'rgba(255,255,255,0.05)',
          border:     '1px solid rgba(255,255,255,0.07)',
        }}
      >
        {label}
      </span>
      <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.07)' }} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  HistoryEntry
//  memo → skips re-render when page/filter change
//  contain: content → browser won't propagate layout recalc up
// ─────────────────────────────────────────────────────────────

interface EntryProps {
  entry:   TaskHistory
  timeAgo: (s: string) => string
}

const HistoryEntry = memo(function HistoryEntry({ entry, timeAgo }: EntryProps) {
  const { t } = useI18n()

  const cfg         = getActionCfg(entry.action_type)
  const subtaskName = entry.meta?.subtask_title as string | undefined
  const isSubtask   = entry.action_type.startsWith('subtask_')
  const accentColor = ACCENT_CSS[cfg.accent]

  // Action label
  let actionLabel: string
  if (entry.action_type === 'field_change') {
    const fieldKey = FIELD_LABELS[entry.field ?? '']
    actionLabel = `${t('actionChangedField')} ${fieldKey ? t(fieldKey) : (entry.field ?? '')}`
  } else if (entry.action_type === 'subtask_toggled') {
    actionLabel = entry.new_value === 'true'
      ? t('actionCompletedSubtask')
      : t(cfg.altLabelKey ?? cfg.labelKey)
  } else {
    actionLabel = t(cfg.labelKey)
  }

  function prettyValue(val: string | null | undefined): string {
    if (val == null || val === 'null' || val === '') return '—'
    const key = VALUE_LABELS[val]
    return key ? t(key) : val
  }

  // Glass card — no backdrop-filter, alpha + border only
  const cardBase: React.CSSProperties = {
    contain:      'content',
    borderRadius: 12,
    padding:      '8px 10px 8px 12px',
    background:   'rgba(255,255,255,0.035)',
    border:       '1px solid rgba(255,255,255,0.08)',
    borderLeft:   `2px solid ${accentColor}`,
  }

  if (cfg.isCreation) {
    return (
      <div className="flex gap-2.5">
        <Avatar name={entry.user.first_name} isCreation />
        <div
          className="flex-1 min-w-0"
          style={{
            ...cardBase,
            background:  'rgba(62,207,142,0.06)',
            border:      '1px solid rgba(62,207,142,0.15)',
            borderLeft:  '2px solid var(--c-emerald)',
          }}
        >
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              {entry.user.first_name}
            </span>
            {entry.user.username && (
              <span className="text-[11px]" style={{ color: 'var(--text-dim)' }}>
                @{entry.user.username}
              </span>
            )}
            <span className="text-[12px]" style={{ color: 'rgba(62,207,142,0.75)' }}>
              {actionLabel}
            </span>
            <span className="text-[10px] ml-auto" style={{ color: 'var(--text-dim)' }}>
              {timeAgo(entry.created_at)}
            </span>
          </div>
          {entry.new_value && (
            <p className="text-[11px] mt-0.5 truncate" style={{ color: 'rgba(62,207,142,0.60)' }}>
              "{entry.new_value}"
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-2.5">
      <Avatar name={entry.user.first_name} isCreation={false} />
      <div className="flex-1 min-w-0" style={cardBase}>
        {/* Name + action + time */}
        <div className="flex items-baseline gap-1.5 flex-wrap mb-1">
          <span className="text-[13px] font-semibold leading-none" style={{ color: 'var(--text-primary)' }}>
            {entry.user.first_name}
          </span>
          {entry.user.username && (
            <span className="text-[11px]" style={{ color: 'var(--text-dim)' }}>
              @{entry.user.username}
            </span>
          )}
          <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
            {actionLabel}
          </span>
          <span className="text-[10px] ml-auto whitespace-nowrap" style={{ color: 'var(--text-dim)' }}>
            {timeAgo(entry.created_at)}
          </span>
        </div>

        {/* Subtask name chip */}
        {isSubtask && subtaskName && entry.action_type !== 'subtask_reordered' && (
          <span
            className="inline-block text-[11px] px-2 py-0.5 rounded-md max-w-[200px] truncate mb-1"
            style={{
              background:     'rgba(255,255,255,0.06)',
              border:         '1px solid rgba(255,255,255,0.08)',
              color:          entry.action_type === 'subtask_deleted'
                                ? 'var(--text-dim)'
                                : 'var(--text-primary)',
              textDecoration: entry.action_type === 'subtask_deleted' ? 'line-through' : 'none',
            }}
          >
            {subtaskName}
          </span>
        )}

        {/* Diff old → new */}
        {cfg.showDiff && (entry.old_value != null || entry.new_value != null) && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {entry.old_value != null && entry.old_value !== 'null' && (
              <>
                <DiffBadge value={prettyValue(entry.old_value)} variant="old" />
                <svg
                  width="10" height="10" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor"
                  strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ color: 'var(--text-dim)', flexShrink: 0 }}
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </>
            )}
            {entry.new_value != null && (
              <DiffBadge value={prettyValue(entry.new_value)} variant="new" />
            )}
          </div>
        )}
      </div>
    </div>
  )
})

// ─────────────────────────────────────────────────────────────
//  FilterTabs — memo
// ─────────────────────────────────────────────────────────────

const FilterTabs = memo(function FilterTabs({
  active,
  onChange,
  counts,
}: {
  active:   FilterGroup
  onChange: (g: FilterGroup) => void
  counts:   Record<FilterGroup, number>
}) {
  return (
    <div
      className="flex gap-1.5 overflow-x-auto pb-0.5 mt-3 px-0.5"
      // Momentum scroll on iOS, no scrollbar
      style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
    >
      {FILTER_TABS.map(tab => {
        const isActive = active === tab.key
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap flex-shrink-0 transition-all duration-150 active:scale-95"
            style={isActive
              ? { background: 'var(--c-accent)', color: '#fff' }
              : {
                  background: 'rgba(255,255,255,0.06)',
                  border:     '1px solid rgba(255,255,255,0.08)',
                  color:      'var(--text-secondary)',
                }
            }
          >
            <span>{tab.emoji}</span>
            {tab.label}
            {counts[tab.key] > 0 && (
              <span
                className="text-[9px] px-1 py-0.5 rounded-full tabular-nums"
                style={isActive
                  ? { background: 'rgba(255,255,255,0.22)', color: '#fff' }
                  : { background: 'rgba(255,255,255,0.08)', color: 'var(--text-dim)' }
                }
              >
                {counts[tab.key]}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
})

// ─────────────────────────────────────────────────────────────
//  Props
// ─────────────────────────────────────────────────────────────

interface Props {
  taskId:      string
  userId:      number
  initial?:    TaskHistory[]
  /** Bump to silently re-fetch — e.g. after task save */
  refetchKey?: number
}

// ─────────────────────────────────────────────────────────────
//  TaskHistoryPanel
// ─────────────────────────────────────────────────────────────

export function TaskHistoryPanel({ taskId, userId, initial = [], refetchKey }: Props) {
  const { t } = useI18n()

  const [open,        setOpen]        = useState(false)
  const [entries,     setEntries]     = useState<TaskHistory[]>(initial)
  const [loading,     setLoading]     = useState(false)
  const [fetched,     setFetched]     = useState(initial.length > 0)
  const [page,        setPage]        = useState(1)
  const [filterGroup, setFilterGroup] = useState<FilterGroup>('all')
  const [refreshing,  setRefreshing]  = useState(false)

  const prevRefetchKey = useRef(refetchKey)
  const timeAgo        = useTimeAgo()

  // ── fetch ───────────────────────────────────────────────
  const fetchHistory = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else         setRefreshing(true)
    try {
      const res  = await apiFetch(`/api/tasks/history?taskId=${taskId}&userId=${userId}`)
      const data = await res.json()
      setEntries(data.history ?? [])
      setFetched(true)
    } catch {}
    if (!silent) setLoading(false)
    else         setRefreshing(false)
  }, [taskId, userId])

  // ── toggle ──────────────────────────────────────────────
  async function handleToggle() {
    if (open) { setOpen(false); return }
    if (!fetched) await fetchHistory()
    setOpen(true)
  }

  // ── manual refresh ───────────────────────────────────────
  async function handleRefresh(e: React.MouseEvent) {
    e.stopPropagation()
    await fetchHistory(true)
    setPage(1)
  }

  // ── refetchKey watcher ───────────────────────────────────
  useEffect(() => {
    if (refetchKey === prevRefetchKey.current) return
    prevRefetchKey.current = refetchKey
    setFetched(false)
    if (open) {
      void fetchHistory(true)
      setPage(1)
    }
  }, [refetchKey, open, fetchHistory])

  // ── derived (all memoized) ───────────────────────────────
  const filtered = useMemo(() =>
    filterGroup === 'all'
      ? entries
      : entries.filter(e => getActionCfg(e.action_type).filterGroup === filterGroup),
  [entries, filterGroup])

  const paginated = useMemo(() => filtered.slice(0, page * PAGE_SIZE), [filtered, page])
  const hasMore   = paginated.length < filtered.length

  const counts = useMemo((): Record<FilterGroup, number> => {
    const c: Record<FilterGroup, number> = { all: entries.length, fields: 0, subtasks: 0, created: 0 }
    for (const e of entries) c[getActionCfg(e.action_type).filterGroup]++
    return c
  }, [entries])

  const grouped = useMemo(() => {
    const now    = new Date()
    const groups: { label: string; items: TaskHistory[] }[] = []
    for (const entry of paginated) {
      const d           = new Date(entry.created_at)
      const isToday     = d.toDateString() === now.toDateString()
      const isYesterday = d.toDateString() === new Date(now.getTime() - 86_400_000).toDateString()
      const label = isToday     ? t('today')
                  : isYesterday ? t('yesterday')
                  : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      const last = groups[groups.length - 1]
      if (last?.label === label) last.items.push(entry)
      else groups.push({ label, items: [entry] })
    }
    return groups
  }, [paginated, t])

  // ─────────────────────────────────────────────────────────
  //  Render
  // ─────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Trigger button ────────────────────────────── */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-3 py-2.5 text-sm transition-all duration-200 active:scale-[0.98]"
        style={{
          borderRadius: 16,
          background:   open
            ? 'rgba(129,115,245,0.09)'
            : 'rgba(255,255,255,0.04)',
          border: open
            ? '1px solid rgba(129,115,245,0.28)'
            : '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <span className="flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
          <History size={14} />
          {t('editHistory')}
          {entries.length > 0 && (
            <span
              className="text-xs px-1.5 py-0.5 rounded-full tabular-nums"
              style={{
                background: 'rgba(255,255,255,0.07)',
                color:      'var(--text-dim)',
              }}
            >
              {entries.length}
            </span>
          )}
        </span>

        <div className="flex items-center gap-2">
          {open && (
            <button
              onClick={handleRefresh}
              className="p-1 rounded-lg"
              style={{ color: refreshing ? 'var(--c-accent)' : 'var(--text-dim)' }}
              title="Refresh history"
            >
              <RefreshCw
                size={12}
                style={{ animation: refreshing ? 'hp-spin 0.7s linear infinite' : 'none' }}
              />
            </button>
          )}
          {loading
            ? (
              <div
                className="w-3.5 h-3.5 rounded-full border-2 flex-shrink-0"
                style={{
                  borderColor:    'rgba(255,255,255,0.12)',
                  borderTopColor: 'var(--c-accent)',
                  animation:      'hp-spin 0.7s linear infinite',
                }}
              />
            )
            : open
              ? <ChevronUp   size={14} style={{ color: 'var(--c-accent)' }} />
              : <ChevronDown size={14} style={{ color: 'var(--text-dim)'  }} />
          }
        </div>
      </button>

      {/* ── Glass panel ────────────────────────────────── */}
      {open && (
        <div
          className="hp-panel"
          style={{
            marginTop:           10,
            borderRadius:        18,
            padding:             '12px 12px 14px',
            // THE one backdrop-blur — only this element gets a compositing layer
            backdropFilter:      'blur(16px)',
            WebkitBackdropFilter:'blur(16px)',
            background:          'rgba(14,16,26,0.55)',
            border:              '1px solid rgba(255,255,255,0.09)',
            // Top-edge highlight → glass illusion
            boxShadow:           'inset 0 1px 0 rgba(255,255,255,0.07), 0 8px 24px rgba(0,0,0,0.22)',
          }}
        >
          {/* Filter tabs */}
          {entries.length > 0 && (
            <FilterTabs
              active={filterGroup}
              onChange={g => { setFilterGroup(g); setPage(1) }}
              counts={counts}
            />
          )}

          <div style={{ marginTop: 12 }}>
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <span className="text-2xl mb-2">
                  {entries.length === 0 ? '📋' : '🔍'}
                </span>
                <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                  {entries.length === 0 ? t('noHistory') : 'No entries for this filter'}
                </p>
                {entries.length === 0 && (
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-dim)' }}>
                    {t('noHistoryDesc')}
                  </p>
                )}
              </div>
            ) : (
              <div className="relative">
                {/* Timeline line */}
                <div
                  className="absolute top-0 bottom-0 w-px pointer-events-none"
                  style={{ left: 13, background: 'rgba(255,255,255,0.07)' }}
                />

                <div className="space-y-2">
                  {grouped.map(group => (
                    <div key={group.label}>
                      <DateSeparator label={group.label} />
                      <div className="space-y-2">
                        {group.items.map(entry => (
                          <HistoryEntry
                            key={entry.id}
                            entry={entry}
                            timeAgo={timeAgo}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Load more */}
                {hasMore && (
                  <button
                    onClick={() => setPage(p => p + 1)}
                    className="w-full mt-3 py-2 text-xs font-medium rounded-xl transition-all duration-150 active:scale-[0.98]"
                    style={{
                      color:      'var(--c-accent)',
                      background: 'rgba(129,115,245,0.07)',
                      border:     '1px solid rgba(129,115,245,0.18)',
                    }}
                  >
                    Load {Math.min(PAGE_SIZE, filtered.length - paginated.length)} more
                    <span className="ml-1" style={{ color: 'var(--text-dim)' }}>
                      ({filtered.length - paginated.length} remaining)
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/*
        Keyframes:
        ─ hp-panel-in: opacity + translateY только → GPU composited, no layout
        ─ hp-spin: rotate → GPU composited
        Scoped prefix "hp-" → no collisions with globals
      */}
      <style>{`
        @keyframes hp-panel-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
        .hp-panel {
          animation: hp-panel-in 0.22s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        @keyframes hp-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}