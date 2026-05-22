import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

interface NotificationRow {
  id:      string
  user_id: number
  type:    string
  message: string
  meta:    { list_id?: string } | null
}

interface NotificationInsert {
  user_id: number
  task_id: string
  type:    string
  message: string
  meta:    { list_id: string }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function getMiniAppUrl(listId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://task-manager-ucl.vercel.app'
  return `${base}?startapp=list_${listId}`
}

// ── Батчевая проверка: 2 запроса вместо N×M ───────────────────
async function getAlreadyNotified(
  db:     ReturnType<typeof createServiceClient>,
  taskIds: string[],
  type:    string
): Promise<Set<string>> {
  if (!taskIds.length) return new Set()

  const { data } = await db
    .from('notifications')
    .select('task_id, user_id')
    .in('task_id', taskIds)
    .eq('type', type)

  const set = new Set<string>()
  for (const row of data ?? []) {
    set.add(`${row.task_id}:${row.user_id}`)
  }
  return set
}

async function fetchAssigneesForTasks(
  db:      ReturnType<typeof createServiceClient>,
  taskIds: string[]
): Promise<Map<string, number[]>> {
  const map = new Map<string, number[]>()
  if (!taskIds.length) return map

  const { data } = await db
    .from('task_assignees')
    .select('task_id, user_id')
    .in('task_id', taskIds)

  for (const row of data ?? []) {
    if (!map.has(row.task_id)) map.set(row.task_id, [])
    map.get(row.task_id)!.push(row.user_id)
  }
  return map
}

async function sendTgMessage(
  userId:  number,
  html:    string,
  listId?: string
): Promise<boolean> {
  try {
    const body: Record<string, unknown> = {
      chat_id:    userId,
      text:       html,
      parse_mode: 'HTML',
    }

    if (listId) {
      body.reply_markup = {
        inline_keyboard: [[
          {
            text:    '📂 Відкрити список',
            web_app: { url: getMiniAppUrl(listId) },
          },
        ]],
      }
    }

    const res  = await fetch(
      `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      }
    )
    const data = await res.json()
    if (!data.ok) console.error('[tg] sendMessage failed:', data.description)
    return data.ok === true
  } catch (e) {
    console.error('[tg] sendMessage exception:', e)
    return false
  }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth   = req.headers.get('authorization')

  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db    = createServiceClient()
  const now   = new Date()
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const stats = {
    queued_due:        0,
    queued_overdue:    0,
    sent:              0,
    failed:            0,
    skipped_synthetic: 0,
  }

  // ── 1. Задачи со сроком в ближайшие 24h ─────────────────────

  const { data: dueTasks } = await db
    .from('tasks')
    .select('id, title, due_at, created_by, list_id')
    .gte('due_at', now.toISOString())
    .lte('due_at', in24h.toISOString())
    .eq('archived', false)
    .neq('status', 'done')

  const dueTaskIds = (dueTasks ?? []).map(t => t.id)

  // Два батчевых запроса вместо N×M индивидуальных
  const [dueAssigneesMap, dueNotified] = await Promise.all([
    fetchAssigneesForTasks(db, dueTaskIds),
    getAlreadyNotified(db, dueTaskIds, 'due_soon'),
  ])

  const dueInserts: NotificationInsert[] = []

  for (const task of dueTasks ?? []) {
    const assigneeIds = dueAssigneesMap.get(task.id) ?? []
    const recipients  = [...new Set(
      [task.created_by, ...assigneeIds].filter(Boolean) as number[]
    )]

    const dueLabel = new Date(task.due_at).toLocaleString('uk-UA', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

    for (const uid of recipients) {
      if (dueNotified.has(`${task.id}:${uid}`)) continue

      dueInserts.push({
        user_id: uid,
        task_id: task.id,
        type:    'due_soon',
        message: [
          `⏰ <b>Завдання скоро завершується</b>`,
          ``,
          `📌 <b>${escapeHtml(task.title)}</b>`,
          `📅 ${dueLabel}`,
        ].join('\n'),
        meta: { list_id: task.list_id },
      })
    }
  }

  if (dueInserts.length) {
    await db.from('notifications').insert(dueInserts)
    stats.queued_due = dueInserts.length
  }

  // ── 2. Просроченные задачи ───────────────────────────────────

  const { data: overdueTasks } = await db
    .from('tasks')
    .select('id, title, created_by, list_id')
    .lt('due_at', now.toISOString())
    .not('due_at', 'is', null)
    .eq('archived', false)
    .neq('status', 'done')

  const overdueTaskIds = (overdueTasks ?? []).map(t => t.id)

  const [overdueAssigneesMap, overdueNotified] = await Promise.all([
    fetchAssigneesForTasks(db, overdueTaskIds),
    getAlreadyNotified(db, overdueTaskIds, 'overdue'),
  ])

  const overdueInserts: NotificationInsert[] = []

  for (const task of overdueTasks ?? []) {
    const assigneeIds = overdueAssigneesMap.get(task.id) ?? []
    const recipients  = [...new Set(
      [task.created_by, ...assigneeIds].filter(Boolean) as number[]
    )]

    for (const uid of recipients) {
      if (overdueNotified.has(`${task.id}:${uid}`)) continue

      overdueInserts.push({
        user_id: uid,
        task_id: task.id,
        type:    'overdue',
        message: [
          `🔴 <b>Завдання прострочено</b>`,
          ``,
          `📌 <b>${escapeHtml(task.title)}</b>`,
        ].join('\n'),
        meta: { list_id: task.list_id },
      })
    }
  }

  if (overdueInserts.length) {
    await db.from('notifications').insert(overdueInserts)
    stats.queued_overdue = overdueInserts.length
  }

  // ── 3. Отправка pending уведомлений ─────────────────────────

  const { data: pending } = await db
    .from('notifications')
    .select('id, user_id, type, message, meta')
    .eq('sent', false)
    .order('created_at', { ascending: true })
    .limit(50)

  // Батч UPDATE вместо отдельного UPDATE на каждое уведомление
  const sentIds:   string[] = []
  const failedIds: string[] = []

  for (const notif of (pending ?? []) as NotificationRow[]) {
    if (notif.user_id < 0) {
      sentIds.push(notif.id)
      stats.skipped_synthetic++
      continue
    }

    const listId = notif.meta?.list_id
    const ok     = await sendTgMessage(notif.user_id, notif.message, listId)

    if (ok) {
      sentIds.push(notif.id)
      stats.sent++
    } else {
      failedIds.push(notif.id)
      stats.failed++
    }
  }

  // Два UPDATE вместо N UPDATE-ов
  await Promise.all([
    sentIds.length
      ? db.from('notifications').update({ sent: true }).in('id', sentIds)
      : Promise.resolve(),
    failedIds.length
      ? db.from('notifications').update({ sent: true }).in('id', failedIds)
      : Promise.resolve(),
  ])

  return NextResponse.json({
    ok:        true,
    timestamp: now.toISOString(),
    ...stats,
  })
}