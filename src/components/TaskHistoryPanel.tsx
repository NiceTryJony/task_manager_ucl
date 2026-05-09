'use client'

import { useState } from 'react'
import { History, ChevronDown, ChevronUp, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TaskHistory, HistoryActionType } from '@/types'

// ── Helpers ────────────────────────────────────────────────────
export function timeAgo(isoStr: string): string {
  const diff  = Date.now() - new Date(isoStr).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(mins / 60)
  const days  = Math.floor(hours / 24)
  if (mins  < 1)  return 'just now'
  if (mins  < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days  < 7)  return `${days}d ago`
  return new Date(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export const FIELD_LABELS: Record<string, string> = {
  title:       'Title',
  description: 'Notes',
  priority:    'Priority',
  status:      'Status',
  due_at:      'Due date',
  archived:    'Archived',
  subtask:     'Subtask',
}

// Human-readable status/priority values
const VALUE_LABELS: Record<string, string> = {
  todo:        'To Do',
  in_progress: 'In Progress',
  done:        'Done',
  low:         'Low',
  medium:      'Medium',
  high:        'High',
  urgent:      'Urgent',
  'true':      'Yes',
  'false':     'No',
  'null':      '—',
}

function prettyValue(val: string | null | undefined): string {
  if (val == null || val === 'null' || val === '') return '—'
  return VALUE_LABELS[val] ?? val
}

// ── Action config ──────────────────────────────────────────────
interface ActionCfg {
  icon:       string
  color:      string
  bg:         string
  label:      (h: TaskHistory) => string
  showDiff?:  boolean
}

const ACTION_CONFIG: Record<HistoryActionType | string, ActionCfg> = {
  field_change: {
    icon: '✏️', color: 'text-accent', bg: 'bg-accent/10',
    label: h => `Changed ${FIELD_LABELS[h.field ?? ''] ?? h.field ?? 'field'}`,
    showDiff: true,
  },
  subtask_added: {
    icon: '➕', color: 'text-emerald', bg: 'bg-emerald/10',
    label: h => `Added subtask`,
    showDiff: false,
  },
  subtask_deleted: {
    icon: '🗑️', color: 'text-danger', bg: 'bg-danger/10',
    label: h => `Removed subtask`,
    showDiff: false,
  },
  subtask_toggled: {
    icon: '✅', color: 'text-accent', bg: 'bg-accent/10',
    label: h => h.new_value === 'true' ? 'Completed subtask' : 'Uncompleted subtask',
    showDiff: false,
  },
  subtask_renamed: {
    icon: '📝', color: 'text-amber', bg: 'bg-amber/10',
    label: h => `Renamed subtask`,
    showDiff: true,
  },
  subtask_reordered: {
    icon: '↕️', color: 'text-text-secondary', bg: 'bg-bg-hover',
    label: () => 'Reordered subtasks',
    showDiff: false,
  },
  task_created: {
    icon: '🆕', color: 'text-emerald', bg: 'bg-emerald/10',
    label: h => `Task created`,
    showDiff: false,
  },
}

function getActionCfg(actionType: string): ActionCfg {
  return ACTION_CONFIG[actionType] ?? {
    icon: '•', color: 'text-text-secondary', bg: 'bg-bg-hover',
    label: h => `Changed ${h.field ?? 'something'}`,
    showDiff: true,
  }
}

// ── Subtask name chip ──────────────────────────────────────────
function SubtaskChip({ title, strikethrough = false }: { title: string; strikethrough?: boolean }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 bg-bg-hover rounded-lg text-xs font-medium text-text-primary max-w-[200px] truncate',
      strikethrough && 'line-through text-text-dim'
    )}>
      {title}
    </span>
  )
}

// ── Single history entry ───────────────────────────────────────
function HistoryEntry({ entry }: { entry: TaskHistory }) {
  const cfg         = getActionCfg(entry.action_type)
  const subtaskName = entry.meta?.subtask_title as string | undefined
  const isSubtask   = entry.action_type.startsWith('subtask_')

  return (
    <div className="flex gap-3 px-3 py-3 bg-bg-card rounded-2xl border border-bg-border/60">
      {/* Icon */}
      <div className={cn(
        'w-8 h-8 rounded-xl flex items-center justify-center text-base flex-shrink-0',
        cfg.bg
      )}>
        <span role="img" aria-hidden>{cfg.icon}</span>
      </div>

      <div className="flex-1 min-w-0">
        {/* Header row: name + time */}
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-text-primary min-w-0 truncate">
            <span
              className="w-5 h-5 rounded-full bg-accent/20 text-accent flex items-center justify-center text-[10px] font-bold flex-shrink-0"
              aria-hidden
            >
              {entry.user.first_name[0]?.toUpperCase()}
            </span>
            <span className="truncate">{entry.user.first_name}</span>
            {entry.user.username && (
              <span className="text-text-dim font-normal shrink-0">@{entry.user.username}</span>
            )}
          </span>
          <span className="text-[10px] text-text-dim whitespace-nowrap flex-shrink-0">
            {timeAgo(entry.created_at)}
          </span>
        </div>

        {/* Action label */}
        <p className={cn('text-xs font-medium mb-1', cfg.color)}>
          {cfg.label(entry)}
        </p>

        {/* Subtask name context */}
        {isSubtask && subtaskName && entry.action_type !== 'subtask_reordered' && (
          <div className="mb-1.5">
            {entry.action_type === 'subtask_deleted' ? (
              <SubtaskChip title={subtaskName} strikethrough />
            ) : (
              <SubtaskChip title={subtaskName} />
            )}
          </div>
        )}

        {/* Diff: old → new */}
        {cfg.showDiff && (entry.old_value != null || entry.new_value != null) && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {entry.old_value != null && entry.old_value !== 'null' && (
              <>
                <span className="text-[11px] px-2 py-0.5 rounded-lg bg-danger/10 text-danger line-through max-w-[140px] truncate">
                  {prettyValue(entry.old_value)}
                </span>
                <span className="text-text-dim text-[11px]">→</span>
              </>
            )}
            {entry.new_value != null && (
              <span className="text-[11px] px-2 py-0.5 rounded-lg bg-emerald/10 text-emerald max-w-[140px] truncate">
                {prettyValue(entry.new_value)}
              </span>
            )}
          </div>
        )}

        {/* task_created: show title */}
        {entry.action_type === 'task_created' && entry.new_value && (
          <p className="text-xs text-text-secondary truncate">"{entry.new_value}"</p>
        )}
      </div>
    </div>
  )
}

// ── Props ──────────────────────────────────────────────────────
interface Props {
  taskId:  string
  userId:  number
  /** Pre-fetched entries (pass [] on first render; component fetches on expand) */
  initial?: TaskHistory[]
}

// ── Main component ─────────────────────────────────────────────
export function TaskHistoryPanel({ taskId, userId, initial = [] }: Props) {
  const [open,    setOpen]    = useState(false)
  const [entries, setEntries] = useState<TaskHistory[]>(initial)
  const [loading, setLoading] = useState(false)
  const [fetched, setFetched] = useState(initial.length > 0)

  async function handleToggle() {
    if (open) { setOpen(false); return }
    if (!fetched) {
      setLoading(true)
      try {
        const res  = await fetch(`/api/tasks/history?taskId=${taskId}&userId=${userId}`)
        const data = await res.json()
        setEntries(data.history ?? [])
        setFetched(true)
      } catch {}
      setLoading(false)
    }
    setOpen(true)
  }

  // Group by date for nicer display
  const grouped: { label: string; items: TaskHistory[] }[] = []
  for (const entry of entries) {
    const d   = new Date(entry.created_at)
    const now = new Date()
    const isToday     = d.toDateString() === now.toDateString()
    const isYesterday = d.toDateString() === new Date(now.getTime() - 86400000).toDateString()
    const label = isToday     ? 'Today'
                : isYesterday ? 'Yesterday'
                : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    const last = grouped[grouped.length - 1]
    if (last && last.label === label) {
      last.items.push(entry)
    } else {
      grouped.push({ label, items: [entry] })
    }
  }

  return (
    <div>
      {/* Toggle button */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-bg-card rounded-2xl border border-bg-border/60 text-sm text-text-secondary hover:bg-bg-hover transition-colors"
      >
        <span className="flex items-center gap-2">
          <History size={14} />
          Edit History
          {entries.length > 0 && (
            <span className="text-xs bg-bg-hover px-1.5 py-0.5 rounded-full tabular-nums">
              {entries.length}
            </span>
          )}
        </span>
        {loading
          ? <div className="w-3.5 h-3.5 border-2 border-text-dim border-t-accent rounded-full animate-spin" />
          : open ? <ChevronUp size={14} /> : <ChevronDown size={14} />
        }
      </button>

      {/* Content */}
      {open && (
        <div className="mt-2 space-y-4 animate-fade-up">
          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <span className="text-2xl mb-2">📋</span>
              <p className="text-xs text-text-dim">No history recorded yet</p>
              <p className="text-[11px] text-text-dim mt-0.5">Changes will appear here after edits are made</p>
            </div>
          ) : (
            grouped.map(group => (
              <div key={group.label}>
                {/* Date divider */}
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex-1 h-px bg-bg-border/60" />
                  <span className="text-[10px] font-semibold text-text-dim uppercase tracking-widest whitespace-nowrap">
                    {group.label}
                  </span>
                  <div className="flex-1 h-px bg-bg-border/60" />
                </div>
                <div className="space-y-2">
                  {group.items.map(entry => (
                    <HistoryEntry key={entry.id} entry={entry} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}