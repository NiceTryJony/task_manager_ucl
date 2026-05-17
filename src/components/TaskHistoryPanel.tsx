'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { History, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TaskHistory, HistoryActionType } from '@/types'
import { useI18n } from '@/lib/i18n-context'
import type { TranslationKey } from '@/lib/i18n'

// ─────────────────────────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────────────────────────

const PAGE_SIZE = 15

// ─────────────────────────────────────────────────────────────
//  useTimeAgo — live-updating relative timestamps
// ─────────────────────────────────────────────────────────────

function useTimeAgo() {
  const { t } = useI18n()
  // Tick every 60 s so "5m ago" stays accurate while panel is open
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
//  Label maps
// ─────────────────────────────────────────────────────────────

function useFieldLabels(): Record<string, TranslationKey> {
  return {
    title: 'fieldTitle', description: 'fieldNotes', priority: 'fieldPriority',
    status: 'fieldStatus', due_at: 'fieldDueDate', archived: 'fieldArchived',
    subtask: 'fieldSubtask',
  }
}

function useValueLabels(): Record<string, TranslationKey> {
  return {
    todo: 'todo', in_progress: 'inProgress', done: 'done',
    low: 'low', medium: 'medium', high: 'high', urgent: 'urgent',
    'true': 'valYes', 'false': 'valNo', 'null': 'valNo',
  }
}

// ─────────────────────────────────────────────────────────────
//  Action config
// ─────────────────────────────────────────────────────────────

interface ActionCfg {
  icon:         string
  labelKey:     TranslationKey
  altLabelKey?: TranslationKey
  showDiff:     boolean
  isCreation:   boolean
  filterGroup:  'fields' | 'subtasks' | 'created'
}

const ACTION_CONFIG: Record<string, ActionCfg> = {
  field_change:      { icon: 'pencil',      labelKey: 'actionChangedField',      showDiff: true,  isCreation: false, filterGroup: 'fields'   },
  subtask_added:     { icon: 'plus',        labelKey: 'actionAddedSubtask',      showDiff: false, isCreation: false, filterGroup: 'subtasks' },
  subtask_deleted:   { icon: 'trash',       labelKey: 'actionRemovedSubtask',    showDiff: false, isCreation: false, filterGroup: 'subtasks' },
  subtask_toggled:   { icon: 'check',       labelKey: 'actionCompletedSubtask',  altLabelKey: 'actionUncompletedSubtask', showDiff: false, isCreation: false, filterGroup: 'subtasks' },
  subtask_renamed:   { icon: 'text-cursor', labelKey: 'actionRenamedSubtask',    showDiff: true,  isCreation: false, filterGroup: 'subtasks' },
  subtask_reordered: { icon: 'arrows-sort', labelKey: 'actionReorderedSubtasks', showDiff: false, isCreation: false, filterGroup: 'subtasks' },
  task_created:      { icon: 'sparkles',    labelKey: 'actionTaskCreated',       showDiff: false, isCreation: true,  filterGroup: 'created'  },
}

function getActionCfg(actionType: string): ActionCfg {
  return ACTION_CONFIG[actionType] ?? {
    icon: 'pencil', labelKey: 'actionChangedField', showDiff: true, isCreation: false, filterGroup: 'fields',
  }
}

// ─────────────────────────────────────────────────────────────
//  Filter types
// ─────────────────────────────────────────────────────────────

type FilterGroup = 'all' | 'fields' | 'subtasks' | 'created'

// ─────────────────────────────────────────────────────────────
//  Sub-components
// ─────────────────────────────────────────────────────────────

function Avatar({ name, isCreation }: { name: string; isCreation: boolean }) {
  const initial = name[0]?.toUpperCase() ?? '?'
  if (isCreation) {
    return (
      <div className="w-7 h-7 rounded-full bg-emerald/15 border border-emerald/30 flex items-center justify-center flex-shrink-0">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald">
          <path d="M12 3l1.9 5.8H20l-4.9 3.6 1.9 5.8L12 15l-5 3.4 1.9-5.8L4 8.8h6.1z" />
        </svg>
      </div>
    )
  }
  return (
    <div className="w-7 h-7 rounded-full bg-bg-hover border border-bg-border flex items-center justify-center flex-shrink-0 text-[11px] font-semibold text-text-secondary">
      {initial}
    </div>
  )
}

function DiffBadge({ value, variant }: { value: string; variant: 'old' | 'new' }) {
  return (
    <span className={cn(
      'inline-block text-[10px] px-2 py-0.5 rounded-full font-medium max-w-[120px] truncate',
      variant === 'old'
        ? 'bg-danger/10 text-danger line-through'
        : 'bg-emerald/10 text-emerald'
    )}>
      {value}
    </span>
  )
}

function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-3 ml-[35px]">
      <div className="flex-1 h-px bg-bg-border/50" />
      <span className="text-[9px] font-semibold uppercase tracking-widest text-text-dim whitespace-nowrap px-1">
        {label}
      </span>
      <div className="flex-1 h-px bg-bg-border/50" />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  HistoryEntry
// ─────────────────────────────────────────────────────────────

function HistoryEntry({ entry }: { entry: TaskHistory }) {
  const { t }       = useI18n()
  const timeAgo     = useTimeAgo()
  const fieldLabels = useFieldLabels()
  const valueLabels = useValueLabels()

  const cfg         = getActionCfg(entry.action_type)
  const subtaskName = entry.meta?.subtask_title as string | undefined
  const isSubtask   = entry.action_type.startsWith('subtask_')

  let actionLabel: string
  if (entry.action_type === 'field_change') {
    const fieldKey = fieldLabels[entry.field ?? '']
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
    const key = valueLabels[val]
    return key ? t(key) : val
  }

  if (cfg.isCreation) {
    return (
      <div className="flex gap-3">
        <Avatar name={entry.user.first_name} isCreation />
        <div className="flex-1 min-w-0 bg-emerald/5 border border-emerald/15 rounded-xl px-3 py-2">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-[13px] font-semibold text-text-primary">{entry.user.first_name}</span>
            {entry.user.username && (
              <span className="text-[11px] text-text-dim">@{entry.user.username}</span>
            )}
            <span className="text-[12px] text-emerald/80">{actionLabel}</span>
            <span className="text-[10px] text-text-dim ml-auto">{timeAgo(entry.created_at)}</span>
          </div>
          {entry.new_value && (
            <p className="text-[11px] text-emerald/70 mt-0.5 truncate">"{entry.new_value}"</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3">
      <Avatar name={entry.user.first_name} isCreation={false} />
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-baseline gap-1.5 flex-wrap mb-1">
          <span className="text-[13px] font-semibold text-text-primary leading-none">
            {entry.user.first_name}
          </span>
          {entry.user.username && (
            <span className="text-[11px] text-text-dim">@{entry.user.username}</span>
          )}
          <span className="text-[12px] text-text-secondary">{actionLabel}</span>
          <span className="text-[10px] text-text-dim ml-auto whitespace-nowrap">
            {timeAgo(entry.created_at)}
          </span>
        </div>

        {isSubtask && subtaskName && entry.action_type !== 'subtask_reordered' && (
          <span className={cn(
            'inline-block text-[11px] px-2 py-0.5 rounded-md bg-bg-hover text-text-primary border border-bg-border/60 max-w-[200px] truncate mb-1',
            entry.action_type === 'subtask_deleted' && 'line-through text-text-dim'
          )}>
            {subtaskName}
          </span>
        )}

        {cfg.showDiff && (entry.old_value != null || entry.new_value != null) && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {entry.old_value != null && entry.old_value !== 'null' && (
              <>
                <DiffBadge value={prettyValue(entry.old_value)} variant="old" />
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  className="text-text-dim flex-shrink-0">
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
}

// ─────────────────────────────────────────────────────────────
//  FilterTabs
// ─────────────────────────────────────────────────────────────

const FILTER_TABS: { key: FilterGroup; label: string; emoji: string }[] = [
  { key: 'all',      label: 'All',      emoji: '📋' },
  { key: 'fields',   label: 'Fields',   emoji: '✏️' },
  { key: 'subtasks', label: 'Subtasks', emoji: '☑️' },
  { key: 'created',  label: 'Created',  emoji: '✨' },
]

function FilterTabs({
  active,
  onChange,
  counts,
}: {
  active:   FilterGroup
  onChange: (g: FilterGroup) => void
  counts:   Record<FilterGroup, number>
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5 mt-3" style={{ scrollbarWidth: 'none' }}>
      {FILTER_TABS.map(tab => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            'flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all flex-shrink-0',
            active === tab.key
              ? 'bg-accent text-white'
              : 'bg-bg-hover text-text-secondary hover:bg-bg-border'
          )}
        >
          <span>{tab.emoji}</span>
          {tab.label}
          {counts[tab.key] > 0 && (
            <span className={cn(
              'text-[9px] px-1 py-0.5 rounded-full tabular-nums',
              active === tab.key ? 'bg-white/20' : 'bg-bg-border text-text-dim'
            )}>
              {counts[tab.key]}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  Props
// ─────────────────────────────────────────────────────────────

interface Props {
  taskId:      string
  userId:      number
  initial?:    TaskHistory[]
  /** Bump this to force a refetch (e.g. after task save) */
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

  // Track previous refetchKey so we only re-fetch on actual bumps
  const prevRefetchKey = useRef(refetchKey)

  // ── fetch ────────────────────────────────────────────────
  const fetchHistory = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const res  = await fetch(`/api/tasks/history?taskId=${taskId}&userId=${userId}`)
      const data = await res.json()
      setEntries(data.history ?? [])
      setFetched(true)
    } catch {}
    if (!silent) setLoading(false)
    else setRefreshing(false)
  }, [taskId, userId])

  // ── open / close ────────────────────────────────────────
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
  // When parent bumps refetchKey (e.g. after save), silently
  // refresh if the panel is already open, or invalidate so
  // next open triggers a fresh fetch.
  useEffect(() => {
    if (refetchKey === prevRefetchKey.current) return
    prevRefetchKey.current = refetchKey
    setFetched(false)
    if (open) {
      void fetchHistory(true)
      setPage(1)
    }
  }, [refetchKey, open, fetchHistory])

  // ── filter + pagination (memoized) ───────────────────────
  const filtered = useMemo(() => {
    if (filterGroup === 'all') return entries
    return entries.filter(e => getActionCfg(e.action_type).filterGroup === filterGroup)
  }, [entries, filterGroup])

  const paginated = useMemo(() => filtered.slice(0, page * PAGE_SIZE), [filtered, page])
  const hasMore   = paginated.length < filtered.length

  // ── filter counts (memoized) ─────────────────────────────
  const counts = useMemo((): Record<FilterGroup, number> => {
    const c: Record<FilterGroup, number> = { all: entries.length, fields: 0, subtasks: 0, created: 0 }
    for (const e of entries) {
      const g = getActionCfg(e.action_type).filterGroup
      c[g] = (c[g] ?? 0) + 1
    }
    return c
  }, [entries])

  // ── group paginated entries by date (memoized) ───────────
  const grouped = useMemo(() => {
    const groups: { label: string; items: TaskHistory[] }[] = []
    const now = new Date()

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
  return (
    <div>
      {/* Trigger button */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-bg-card rounded-2xl border border-bg-border/60 text-sm text-text-secondary hover:bg-bg-hover transition-colors"
      >
        <span className="flex items-center gap-2">
          <History size={14} />
          {t('editHistory')}
          {entries.length > 0 && (
            <span className="text-xs bg-bg-hover px-1.5 py-0.5 rounded-full tabular-nums">
              {entries.length}
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {open && (
            <button
              onClick={handleRefresh}
              className={cn(
                'p-1 rounded-lg text-text-dim hover:text-accent hover:bg-accent/10 transition-all',
                refreshing && 'animate-spin text-accent'
              )}
              title="Refresh history"
            >
              <RefreshCw size={12} />
            </button>
          )}
          {loading
            ? <div className="w-3.5 h-3.5 border-2 border-text-dim border-t-accent rounded-full animate-spin" />
            : open ? <ChevronUp size={14} /> : <ChevronDown size={14} />
          }
        </div>
      </button>

      {open && (
        <div className="mt-2 animate-fade-up">
          {/* Filter tabs — only show when there are entries */}
          {entries.length > 0 && (
            <FilterTabs
              active={filterGroup}
              onChange={g => { setFilterGroup(g); setPage(1) }}
              counts={counts}
            />
          )}

          <div className="mt-3">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <span className="text-2xl mb-2">
                  {entries.length === 0 ? '📋' : '🔍'}
                </span>
                <p className="text-xs text-text-dim">
                  {entries.length === 0 ? t('noHistory') : 'No entries for this filter'}
                </p>
                {entries.length === 0 && (
                  <p className="text-[11px] text-text-dim mt-0.5">{t('noHistoryDesc')}</p>
                )}
              </div>
            ) : (
              <div className="relative">
                {/* Vertical timeline line */}
                <div className="absolute left-[13px] top-0 bottom-0 w-px bg-bg-border/50" />

                <div className="space-y-3">
                  {grouped.map(group => (
                    <div key={group.label}>
                      <DateSeparator label={group.label} />
                      <div className="space-y-3">
                        {group.items.map(entry => (
                          <HistoryEntry key={entry.id} entry={entry} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Load more */}
                {hasMore && (
                  <button
                    onClick={() => setPage(p => p + 1)}
                    className="w-full mt-4 py-2 text-xs text-accent font-medium hover:bg-accent/5 rounded-xl transition-colors border border-accent/20"
                  >
                    Load {Math.min(PAGE_SIZE, filtered.length - paginated.length)} more
                    <span className="text-text-dim ml-1">
                      ({filtered.length - paginated.length} remaining)
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}