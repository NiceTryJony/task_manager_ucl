// src/app/api/export/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { exportTasksToText } from '@/lib/utils'

// ── Markdown ──────────────────────────────────────────────────
function exportToMarkdown(title: string, tasks: any[]): string {
  const lines: string[] = []
  lines.push(`# ${title}`)
  lines.push(`> Exported: ${new Date().toLocaleString('en-US')}`)
  lines.push('')

  const groups = {
    todo:        tasks.filter(t => t.status === 'todo'),
    in_progress: tasks.filter(t => t.status === 'in_progress'),
    done:        tasks.filter(t => t.status === 'done'),
  }

  const sections: [string, any[]][] = [
    ['📋 To Do',       groups.todo],
    ['⚡ In Progress', groups.in_progress],
    ['✅ Done',        groups.done],
  ]

  for (const [heading, list] of sections) {
    if (!list.length) continue
    lines.push(`## ${heading}`)
    lines.push('')
    for (const t of list) {
      const check    = t.status === 'done' ? '[x]' : '[ ]'
      const priority = `\`${t.priority.toUpperCase()}\``
      const rawDue   = t.due_at ?? t.due_date
      const due      = rawDue ? ` | 📅 ${rawDue.slice(0, 10)}` : ''
      lines.push(`- ${check} **${t.title}** ${priority}${due}`)
      if (t.description) lines.push(`  > ${t.description}`)
      if (t.subtasks?.length) {
        for (const s of t.subtasks) {
          lines.push(`  - ${s.completed ? '[x]' : '[ ]'} ${s.title}`)
        }
      }
    }
    lines.push('')
  }

  return lines.join('\n')
}

// ── CSV ───────────────────────────────────────────────────────
function exportToCSV(tasks: any[]): string {
  const headers = ['Title', 'Status', 'Priority', 'Due Date', 'Description', 'Subtasks Done', 'Subtasks Total']
  const esc     = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`

  const rows = tasks.map(t => [
    esc(t.title),
    t.status,
    t.priority,
    (t.due_at ?? t.due_date ?? '').slice(0, 10),
    esc(t.description ?? ''),
    t.subtasks?.filter((s: any) => s.completed).length ?? 0,
    t.subtasks?.length ?? 0,
  ].join(','))

  return [headers.join(','), ...rows].join('\n')
}

// ── Route ─────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const listId = searchParams.get('listId')
  const userId = searchParams.get('userId')
  const format = searchParams.get('format') ?? 'text'

  if (!listId || userId == null) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const db = createServiceClient()

  const { data: member } = await db
    .from('list_members').select('role')
    .eq('list_id', listId).eq('user_id', userId).single()

  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: list } = await db
    .from('task_lists').select('id, title').eq('id', listId).single()

  const { data: tasks } = await db
    .from('tasks')
    .select('*, subtasks(*)')
    .eq('list_id', listId)
    .eq('archived', false)
    .order('position', { ascending: true })

  const taskList = tasks ?? []
  const title    = list?.title ?? 'Tasks'

  switch (format) {
    case 'json':
      return NextResponse.json({
        list:        { id: listId, title },
        tasks:       taskList,
        exported_at: new Date().toISOString(),
      })

    case 'csv':
      return new NextResponse(exportToCSV(taskList), {
        headers: {
          'Content-Type':        'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${title}.csv"`,
        },
      })

    case 'markdown':
      return new NextResponse(exportToMarkdown(title, taskList), {
        headers: {
          'Content-Type':        'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="${title}.md"`,
        },
      })

    default: // 'text'
      return new NextResponse(exportTasksToText(title, taskList), {
        headers: {
          'Content-Type':        'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="${title}.txt"`,
        },
      })
  }
}