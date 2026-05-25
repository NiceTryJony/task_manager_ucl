import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Priority, TaskStatus } from '@/types'
import { useI18n } from '@/lib/i18n-context'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; bg: string; dot: string }> = {
  low:    { label: 'Low',    color: 'text-text-secondary', bg: 'bg-bg-hover',          dot: '#8884A8' },
  medium: { label: 'Medium', color: 'text-amber',          bg: 'bg-amber/10',           dot: '#FBBF24' },
  high:   { label: 'High',   color: 'text-pink',           bg: 'bg-pink/10',            dot: '#F472B6' },
  urgent: { label: 'Urgent', color: 'text-danger',         bg: 'bg-danger/10',          dot: '#F87171' },
}

export const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bg: string }> = {
  todo:        { label: 'To Do',       color: 'text-text-secondary', bg: 'bg-bg-hover' },
  in_progress: { label: 'In Progress', color: 'text-accent',         bg: 'bg-accent/10' },
  done:        { label: 'Done',        color: 'text-emerald',        bg: 'bg-emerald/10' },
}

export const LIST_COLORS = [
  '#7B6EF6', '#F472B6', '#34D399', '#FBBF24',
  '#60A5FA', '#F87171', '#A78BFA', '#34D8A8',
]

export const LIST_EMOJIS = [
  '📋', '✅', '🚀', '💡', '📌', '🎯', '📝', '⚡',
  '🔥', '💼', '🎨', '📊', '🏠', '🌿', '💪', '🎓',
]

export function formatDueDate(date: string): { label: string; urgent: boolean; overdue: boolean } {
  const d = new Date(date)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000)

  if (diffDays < 0)  return { label: `${Math.abs(diffDays)}d overdue`, urgent: true,  overdue: true }
  if (diffDays === 0) return { label: 'Today',                          urgent: true,  overdue: false }
  if (diffDays === 1) return { label: 'Tomorrow',                       urgent: true,  overdue: false }
  if (diffDays <= 7)  return { label: `${diffDays}d left`,              urgent: false, overdue: false }
  return { label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), urgent: false, overdue: false }
}

export function exportTasksToText(
  listTitle: string,
  tasks: Array<{ title: string; status: string; priority: string; due_date?: string; description?: string; subtasks?: Array<{ title: string; completed: boolean }> }>
): string {
  const lines: string[] = []
  lines.push(`# ${listTitle}`)
  lines.push(`Exported: ${new Date().toLocaleString('en-US')}`)
  lines.push('')

  const groups = {
    todo:        tasks.filter(t => t.status === 'todo'),
    in_progress: tasks.filter(t => t.status === 'in_progress'),
    done:        tasks.filter(t => t.status === 'done'),
  }

  const sections: [string, typeof groups.todo][] = [
    ['📋 To Do',        groups.todo],
    ['⚡ In Progress',  groups.in_progress],
    ['✅ Done',         groups.done],
  ]

  for (const [heading, list] of sections) {
    if (!list.length) continue
    lines.push(`## ${heading} (${list.length})`)
    for (const t of list) {
      const check = t.status === 'done' ? '[x]' : '[ ]'
      const due = t.due_date ? ` · Due: ${t.due_date}` : ''
      lines.push(`- ${check} ${t.title} [${t.priority.toUpperCase()}]${due}`)
      if (t.description) lines.push(`       ${t.description}`)
      if (t.subtasks?.length) {
        for (const s of t.subtasks) {
          lines.push(`    ${s.completed ? '[x]' : '[ ]'} ${s.title}`)
        }
      }
    }
    lines.push('')
  }

  return lines.join('\n')
}
