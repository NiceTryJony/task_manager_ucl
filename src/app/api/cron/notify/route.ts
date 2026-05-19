// src/app/api/cron/notify/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// ── Helpers ────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

async function sendTgMessage(userId: number, html: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id:    userId,
          text:       html,
          parse_mode: 'HTML',
        }),
      }
    )
    const data = await res.json()
    return data.ok === true
  } catch {
    return false
  }
}

async function alreadyQueued(
  db:     ReturnType<typeof createServiceClient>,
  taskId: string,
  userId: number,
  type:   string
): Promise<boolean> {
  const { data } = await db
    .from('notifications')
    .select('id')
    .eq('task_id', taskId)
    .eq('user_id', userId)
    .eq('type', type)
    .eq('sent', false)
    .limit(1)
  return (data?.length ?? 0) > 0
}

/**
 * Fetch all assignee user_ids for a batch of task IDs.
 * Returns Map<taskId, number[]>
 */
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

// ── GET /api/cron/notify ───────────────────────────────────────

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')

  if (secret) {
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
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

  // ── 1. Tasks due in next 24 h ──────────────────────────────
  const { data: dueTasks } = await db
    .from('tasks')
    .select('id, title, due_at, created_by')
    .gte('due_at', now.toISOString())
    .lte('due_at', in24h.toISOString())
    .eq('archived', false)
    .neq('status', 'done')

  const dueTaskIds     = (dueTasks ?? []).map(t => t.id)
  const dueAssigneesMap = await fetchAssigneesForTasks(db, dueTaskIds)

  for (const task of dueTasks ?? []) {
    const assigneeIds = dueAssigneesMap.get(task.id) ?? []
    const recipients  = [...new Set([task.created_by, ...assigneeIds].filter(Boolean) as number[])]
    const dueLabel    = new Date(task.due_at).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })

    for (const uid of recipients) {
      if (await alreadyQueued(db, task.id, uid, 'due_soon')) continue
      await db.from('notifications').insert({
        user_id: uid,
        task_id: task.id,
        type:    'due_soon',
        message: [
          `⏰ <b>Завдання скоро завершується</b>`,
          ``,
          `📌 <b>${escapeHtml(task.title)}</b>`,
          `📅 ${dueLabel}`,
          ``,
          `<a href="https://t.me/ucl_maanger_bot/app?startapp=task_${task.id}">Відкрити завдання →</a>`,
        ].join('\n'),
      })
      stats.queued_due++
    }
  }

  // ── 2. Overdue tasks ───────────────────────────────────────
  const { data: overdueTasks } = await db
    .from('tasks')
    .select('id, title, created_by')
    .lt('due_at', now.toISOString())
    .not('due_at', 'is', null)
    .eq('archived', false)
    .neq('status', 'done')

  const overdueTaskIds      = (overdueTasks ?? []).map(t => t.id)
  const overdueAssigneesMap = await fetchAssigneesForTasks(db, overdueTaskIds)

  for (const task of overdueTasks ?? []) {
    const assigneeIds = overdueAssigneesMap.get(task.id) ?? []
    const recipients  = [...new Set([task.created_by, ...assigneeIds].filter(Boolean) as number[])]

    for (const uid of recipients) {
      if (await alreadyQueued(db, task.id, uid, 'overdue')) continue
      await db.from('notifications').insert({
        user_id: uid,
        task_id: task.id,
        type:    'overdue',
        message: [
          `🔴 <b>Завдання прострочено</b>`,
          ``,
          `📌 <b>${escapeHtml(task.title)}</b>`,
          ``,
          `<a href="https://t.me/ucl_maanger_bot/app?startapp=task_${task.id}">Відкрити завдання →</a>`,
        ].join('\n'),
      })
      stats.queued_overdue++
    }
  }

  // ── 3. Send pending notifications ─────────────────────────
  const { data: pending } = await db
    .from('notifications')
    .select('*')
    .eq('sent', false)
    .order('created_at', { ascending: true })
    .limit(50)

  for (const notif of pending ?? []) {
    if (notif.user_id < 0) {
      await db.from('notifications').update({ sent: true }).eq('id', notif.id)
      stats.skipped_synthetic++
      continue
    }

    const ok = await sendTgMessage(notif.user_id, notif.message)
    await db.from('notifications').update({ sent: true }).eq('id', notif.id)
    ok ? stats.sent++ : stats.failed++
  }

  return NextResponse.json({
    ok:        true,
    timestamp: now.toISOString(),
    ...stats,
  })
}