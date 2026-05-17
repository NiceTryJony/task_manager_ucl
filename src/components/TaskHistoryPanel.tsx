// 'use client'

// import { useState } from 'react'
// import { History, ChevronDown, ChevronUp } from 'lucide-react'
// import { cn } from '@/lib/utils'
// import type { TaskHistory, HistoryActionType } from '@/types'
// import { useI18n } from '@/lib/i18n-context'
// import type { TranslationKey } from '@/lib/i18n'

// // ── Time helper ────────────────────────────────────────────────
// function useTimeAgo() {
//   const { t } = useI18n()
//   return (isoStr: string): string => {
//     const diff  = Date.now() - new Date(isoStr).getTime()
//     const mins  = Math.floor(diff / 60000)
//     const hours = Math.floor(mins / 60)
//     const days  = Math.floor(hours / 24)
//     if (mins  < 1)  return t('justNow')
//     if (mins  < 60) return `${mins}${t('mAgo')}`
//     if (hours < 24) return `${hours}${t('hAgo')}`
//     if (days  < 7)  return `${days}${t('dAgo')}`
//     return new Date(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
//   }
// }

// // ── Field / value label maps (built inside component) ─────────
// function useFieldLabels(): Record<string, TranslationKey> {
//   return {
//     title:       'fieldTitle',
//     description: 'fieldNotes',
//     priority:    'fieldPriority',
//     status:      'fieldStatus',
//     due_at:      'fieldDueDate',
//     archived:    'fieldArchived',
//     subtask:     'fieldSubtask',
//   }
// }

// function useValueLabels(): Record<string, TranslationKey> {
//   return {
//     todo:        'todo',
//     in_progress: 'inProgress',
//     done:        'done',
//     low:         'low',
//     medium:      'medium',
//     high:        'high',
//     urgent:      'urgent',
//     'true':      'valYes',
//     'false':     'valNo',
//     'null':      'valNo',
//   }
// }

// // ── Action config ──────────────────────────────────────────────
// interface ActionCfg {
//   icon:      string
//   color:     string
//   bg:        string
//   labelKey:  TranslationKey
//   altLabelKey?: TranslationKey  // for subtask_toggled alternate
//   showDiff?: boolean
// }

// const ACTION_CONFIG: Record<string, ActionCfg> = {
//   field_change:       { icon: '✏️', color: 'text-accent',          bg: 'bg-accent/10',   labelKey: 'actionChangedField',      showDiff: true  },
//   subtask_added:      { icon: '➕', color: 'text-emerald',         bg: 'bg-emerald/10',  labelKey: 'actionAddedSubtask',      showDiff: false },
//   subtask_deleted:    { icon: '🗑️', color: 'text-danger',          bg: 'bg-danger/10',   labelKey: 'actionRemovedSubtask',    showDiff: false },
//   subtask_toggled:    { icon: '✅', color: 'text-accent',          bg: 'bg-accent/10',   labelKey: 'actionCompletedSubtask',  altLabelKey: 'actionUncompletedSubtask', showDiff: false },
//   subtask_renamed:    { icon: '📝', color: 'text-amber',           bg: 'bg-amber/10',    labelKey: 'actionRenamedSubtask',    showDiff: true  },
//   subtask_reordered:  { icon: '↕️', color: 'text-text-secondary',  bg: 'bg-bg-hover',    labelKey: 'actionReorderedSubtasks', showDiff: false },
//   task_created:       { icon: '🆕', color: 'text-emerald',         bg: 'bg-emerald/10',  labelKey: 'actionTaskCreated',       showDiff: false },
// }

// function getActionCfg(actionType: string): ActionCfg {
//   return ACTION_CONFIG[actionType] ?? {
//     icon: '•', color: 'text-text-secondary', bg: 'bg-bg-hover',
//     labelKey: 'actionChangedField', showDiff: true,
//   }
// }

// // ── Subtask name chip ──────────────────────────────────────────
// function SubtaskChip({ title, strikethrough = false }: { title: string; strikethrough?: boolean }) {
//   return (
//     <span className={cn(
//       'inline-flex items-center gap-1 px-2 py-0.5 bg-bg-hover rounded-lg text-xs font-medium text-text-primary max-w-[200px] truncate',
//       strikethrough && 'line-through text-text-dim'
//     )}>
//       {title}
//     </span>
//   )
// }

// // ── Single history entry ───────────────────────────────────────
// function HistoryEntry({ entry }: { entry: TaskHistory }) {
//   const { t } = useI18n()
//   const timeAgo      = useTimeAgo()
//   const fieldLabels  = useFieldLabels()
//   const valueLabels  = useValueLabels()

//   const cfg         = getActionCfg(entry.action_type)
//   const subtaskName = entry.meta?.subtask_title as string | undefined
//   const isSubtask   = entry.action_type.startsWith('subtask_')

//   // Build action label
//   let actionLabel: string
//   if (entry.action_type === 'field_change') {
//     const fieldKey = fieldLabels[entry.field ?? '']
//     const fieldStr = fieldKey ? t(fieldKey) : (entry.field ?? '')
//     actionLabel = `${t('actionChangedField')} ${fieldStr}`
//   } else if (entry.action_type === 'subtask_toggled') {
//     actionLabel = entry.new_value === 'true'
//       ? t('actionCompletedSubtask')
//       : t(cfg.altLabelKey ?? cfg.labelKey)
//   } else {
//     actionLabel = t(cfg.labelKey)
//   }

//   function prettyValue(val: string | null | undefined): string {
//     if (val == null || val === 'null' || val === '') return '—'
//     const key = valueLabels[val]
//     return key ? t(key) : val
//   }

//   return (
//     <div className="flex gap-3 px-3 py-3 bg-bg-card rounded-2xl border border-bg-border/60">
//       <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center text-base flex-shrink-0', cfg.bg)}>
//         <span role="img" aria-hidden>{cfg.icon}</span>
//       </div>

//       <div className="flex-1 min-w-0">
//         <div className="flex items-center justify-between gap-2 mb-1">
//           <span className="flex items-center gap-1.5 text-xs font-semibold text-text-primary min-w-0 truncate">
//             <span className="w-5 h-5 rounded-full bg-accent/20 text-accent flex items-center justify-center text-[10px] font-bold flex-shrink-0" aria-hidden>
//               {entry.user.first_name[0]?.toUpperCase()}
//             </span>
//             <span className="truncate">{entry.user.first_name}</span>
//             {entry.user.username && (
//               <span className="text-text-dim font-normal shrink-0">@{entry.user.username}</span>
//             )}
//           </span>
//           <span className="text-[10px] text-text-dim whitespace-nowrap flex-shrink-0">
//             {timeAgo(entry.created_at)}
//           </span>
//         </div>

//         <p className={cn('text-xs font-medium mb-1', cfg.color)}>{actionLabel}</p>

//         {isSubtask && subtaskName && entry.action_type !== 'subtask_reordered' && (
//           <div className="mb-1.5">
//             {entry.action_type === 'subtask_deleted'
//               ? <SubtaskChip title={subtaskName} strikethrough />
//               : <SubtaskChip title={subtaskName} />
//             }
//           </div>
//         )}

//         {cfg.showDiff && (entry.old_value != null || entry.new_value != null) && (
//           <div className="flex items-center gap-1.5 flex-wrap">
//             {entry.old_value != null && entry.old_value !== 'null' && (
//               <>
//                 <span className="text-[11px] px-2 py-0.5 rounded-lg bg-danger/10 text-danger line-through max-w-[140px] truncate">
//                   {prettyValue(entry.old_value)}
//                 </span>
//                 <span className="text-text-dim text-[11px]">→</span>
//               </>
//             )}
//             {entry.new_value != null && (
//               <span className="text-[11px] px-2 py-0.5 rounded-lg bg-emerald/10 text-emerald max-w-[140px] truncate">
//                 {prettyValue(entry.new_value)}
//               </span>
//             )}
//           </div>
//         )}

//         {entry.action_type === 'task_created' && entry.new_value && (
//           <p className="text-xs text-text-secondary truncate">"{entry.new_value}"</p>
//         )}
//       </div>
//     </div>
//   )
// }

// // ── Props ──────────────────────────────────────────────────────
// interface Props {
//   taskId:   string
//   userId:   number
//   initial?: TaskHistory[]
// }

// // ── Main component ─────────────────────────────────────────────
// export function TaskHistoryPanel({ taskId, userId, initial = [] }: Props) {
//   const { t } = useI18n()
//   const [open,    setOpen]    = useState(false)
//   const [entries, setEntries] = useState<TaskHistory[]>(initial)
//   const [loading, setLoading] = useState(false)
//   const [fetched, setFetched] = useState(initial.length > 0)

//   async function handleToggle() {
//     if (open) { setOpen(false); return }
//     if (!fetched) {
//       setLoading(true)
//       try {
//         const res  = await fetch(`/api/tasks/history?taskId=${taskId}&userId=${userId}`)
//         const data = await res.json()
//         setEntries(data.history ?? [])
//         setFetched(true)
//       } catch {}
//       setLoading(false)
//     }
//     setOpen(true)
//   }

//   // Group by date
//   const grouped: { label: string; items: TaskHistory[] }[] = []
//   for (const entry of entries) {
//     const d   = new Date(entry.created_at)
//     const now = new Date()
//     const isToday     = d.toDateString() === now.toDateString()
//     const isYesterday = d.toDateString() === new Date(now.getTime() - 86400000).toDateString()
//     const label = isToday     ? t('today')
//                 : isYesterday ? t('yesterday')
//                 : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
//     const last = grouped[grouped.length - 1]
//     if (last && last.label === label) last.items.push(entry)
//     else grouped.push({ label, items: [entry] })
//   }

//   return (
//     <div>
//       <button
//         onClick={handleToggle}
//         className="w-full flex items-center justify-between px-3 py-2.5 bg-bg-card rounded-2xl border border-bg-border/60 text-sm text-text-secondary hover:bg-bg-hover transition-colors"
//       >
//         <span className="flex items-center gap-2">
//           <History size={14} />
//           {t('editHistory')}
//           {entries.length > 0 && (
//             <span className="text-xs bg-bg-hover px-1.5 py-0.5 rounded-full tabular-nums">
//               {entries.length}
//             </span>
//           )}
//         </span>
//         {loading
//           ? <div className="w-3.5 h-3.5 border-2 border-text-dim border-t-accent rounded-full animate-spin" />
//           : open ? <ChevronUp size={14} /> : <ChevronDown size={14} />
//         }
//       </button>

//       {open && (
//         <div className="mt-2 space-y-4 animate-fade-up">
//           {entries.length === 0 ? (
//             <div className="flex flex-col items-center justify-center py-6 text-center">
//               <span className="text-2xl mb-2">📋</span>
//               <p className="text-xs text-text-dim">{t('noHistory')}</p>
//               <p className="text-[11px] text-text-dim mt-0.5">{t('noHistoryDesc')}</p>
//             </div>
//           ) : (
//             grouped.map(group => (
//               <div key={group.label}>
//                 <div className="flex items-center gap-2 mb-2">
//                   <div className="flex-1 h-px bg-bg-border/60" />
//                   <span className="text-[10px] font-semibold text-text-dim uppercase tracking-widest whitespace-nowrap">
//                     {group.label}
//                   </span>
//                   <div className="flex-1 h-px bg-bg-border/60" />
//                 </div>
//                 <div className="space-y-2">
//                   {group.items.map(entry => (
//                     <HistoryEntry key={entry.id} entry={entry} />
//                   ))}
//                 </div>
//               </div>
//             ))
//           )}
//         </div>
//       )}
//     </div>
//   )
// }




















'use client'

import { useState } from 'react'
import { History, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TaskHistory, HistoryActionType } from '@/types'
import { useI18n } from '@/lib/i18n-context'
import type { TranslationKey } from '@/lib/i18n'

function useTimeAgo() {
  const { t } = useI18n()
  return (isoStr: string): string => {
    const diff  = Date.now() - new Date(isoStr).getTime()
    const mins  = Math.floor(diff / 60000)
    const hours = Math.floor(mins / 60)
    const days  = Math.floor(hours / 24)
    if (mins  < 1)  return t('justNow')
    if (mins  < 60) return `${mins}${t('mAgo')}`
    if (hours < 24) return `${hours}${t('hAgo')}`
    if (days  < 7)  return `${days}${t('dAgo')}`
    return new Date(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
}

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

// ── Конфиг действий ────────────────────────────────────────────
interface ActionCfg {
  icon:         string          // lucide icon name (будем рендерить вручную)
  labelKey:     TranslationKey
  altLabelKey?: TranslationKey
  showDiff:     boolean
  isCreation:   boolean
}

const ACTION_CONFIG: Record<string, ActionCfg> = {
  field_change:      { icon: 'pencil',        labelKey: 'actionChangedField',      showDiff: true,  isCreation: false },
  subtask_added:     { icon: 'plus',          labelKey: 'actionAddedSubtask',      showDiff: false, isCreation: false },
  subtask_deleted:   { icon: 'trash',         labelKey: 'actionRemovedSubtask',    showDiff: false, isCreation: false },
  subtask_toggled:   { icon: 'check',         labelKey: 'actionCompletedSubtask',  altLabelKey: 'actionUncompletedSubtask', showDiff: false, isCreation: false },
  subtask_renamed:   { icon: 'text-cursor',   labelKey: 'actionRenamedSubtask',    showDiff: true,  isCreation: false },
  subtask_reordered: { icon: 'arrows-sort',   labelKey: 'actionReorderedSubtasks', showDiff: false, isCreation: false },
  task_created:      { icon: 'sparkles',      labelKey: 'actionTaskCreated',       showDiff: false, isCreation: true  },
}

function getActionCfg(actionType: string): ActionCfg {
  return ACTION_CONFIG[actionType] ?? {
    icon: 'pencil', labelKey: 'actionChangedField', showDiff: true, isCreation: false,
  }
}

// ── Avatar ─────────────────────────────────────────────────────
function Avatar({ name, isCreation }: { name: string; isCreation: boolean }) {
  const initial = name[0]?.toUpperCase() ?? '?'
  if (isCreation) {
    return (
      <div className="w-7 h-7 rounded-full bg-emerald/15 border border-emerald/30 flex items-center justify-center flex-shrink-0">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="text-emerald">
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

// ── DiffBadge ──────────────────────────────────────────────────
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

// ── DateSeparator ──────────────────────────────────────────────
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

// ── Одна запись ────────────────────────────────────────────────
function HistoryEntry({ entry }: { entry: TaskHistory }) {
  const { t }       = useI18n()
  const timeAgo     = useTimeAgo()
  const fieldLabels = useFieldLabels()
  const valueLabels = useValueLabels()

  const cfg         = getActionCfg(entry.action_type)
  const subtaskName = entry.meta?.subtask_title as string | undefined
  const isSubtask   = entry.action_type.startsWith('subtask_')

  // Текст действия
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

  // task_created — особый стиль
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
        {/* Строка с именем, действием и временем */}
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

        {/* Название подзадачи */}
        {isSubtask && subtaskName && entry.action_type !== 'subtask_reordered' && (
          <span className={cn(
            'inline-block text-[11px] px-2 py-0.5 rounded-md bg-bg-hover text-text-primary border border-bg-border/60 max-w-[200px] truncate mb-1',
            entry.action_type === 'subtask_deleted' && 'line-through text-text-dim'
          )}>
            {subtaskName}
          </span>
        )}

        {/* Diff old → new */}
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

// ── Props ──────────────────────────────────────────────────────
interface Props {
  taskId:   string
  userId:   number
  initial?: TaskHistory[]
}

// ── Main ───────────────────────────────────────────────────────
export function TaskHistoryPanel({ taskId, userId, initial = [] }: Props) {
  const { t } = useI18n()
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

  // Группировка по дате
  const grouped: { label: string; items: TaskHistory[] }[] = []
  for (const entry of entries) {
    const d   = new Date(entry.created_at)
    const now = new Date()
    const isToday     = d.toDateString() === now.toDateString()
    const isYesterday = d.toDateString() === new Date(now.getTime() - 86400000).toDateString()
    const label = isToday     ? t('today')
                : isYesterday ? t('yesterday')
                : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    const last = grouped[grouped.length - 1]
    if (last?.label === label) last.items.push(entry)
    else grouped.push({ label, items: [entry] })
  }

  return (
    <div>
      {/* Кнопка-триггер */}
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
        {loading
          ? <div className="w-3.5 h-3.5 border-2 border-text-dim border-t-accent rounded-full animate-spin" />
          : open ? <ChevronUp size={14} /> : <ChevronDown size={14} />
        }
      </button>

      {open && (
        <div className="mt-3 animate-fade-up">
          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <span className="text-2xl mb-2">📋</span>
              <p className="text-xs text-text-dim">{t('noHistory')}</p>
              <p className="text-[11px] text-text-dim mt-0.5">{t('noHistoryDesc')}</p>
            </div>
          ) : (
            <div className="relative">
              {/* Вертикальная линия */}
              <div className="absolute left-[13px] top-0 bottom-0 w-px bg-bg-border/50" />

              <div className="space-y-3">
                {grouped.map((group, gi) => (
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
            </div>
          )}
        </div>
      )}
    </div>
  )
}