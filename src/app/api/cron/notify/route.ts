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

/** Проверяет, существует ли уже уведомление данного типа для задачи+пользователя */
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
    .limit(1)
  return (data?.length ?? 0) > 0
}

// ── GET /api/cron/notify ───────────────────────────────────────
// Вызывается Vercel Cron каждые N минут.
// Vercel автоматически передаёт Authorization: Bearer <CRON_SECRET>.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const db    = createServiceClient()
  const now   = new Date()
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const stats = {
    queued_due:      0,
    queued_overdue:  0,
    sent:            0,
    failed:          0,
    skipped_synthetic: 0,
  }

  // ── 1. Ставим в очередь: задачи с дедлайном в течение 24ч ──
  const { data: dueTasks } = await db
    .from('tasks')
    .select('id, title, due_at, created_by, assigned_to')
    .gte('due_at', now.toISOString())
    .lte('due_at', in24h.toISOString())
    .eq('archived', false)
    .neq('status', 'done')

  for (const task of dueTasks ?? []) {
    const recipients = [
      ...new Set(
        [task.created_by, task.assigned_to].filter(Boolean) as number[]
      ),
    ]
    const dueLabel = new Date(task.due_at).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })

    for (const uid of recipients) {
      if (await alreadyQueued(db, task.id, uid, 'due_soon')) continue
      await db.from('notifications').insert({
        user_id: uid,
        task_id: task.id,
        type:    'due_soon',
        message: `⏰ Task due soon\n<b>${escapeHtml(task.title)}</b>\n📅 ${dueLabel}`,
      })
      stats.queued_due++
    }
  }

  // ── 2. Ставим в очередь: просроченные задачи ───────────────
  const { data: overdueTasks } = await db
    .from('tasks')
    .select('id, title, created_by, assigned_to')
    .lt('due_at', now.toISOString())
    .not('due_at', 'is', null)
    .eq('archived', false)
    .neq('status', 'done')

  for (const task of overdueTasks ?? []) {
    const recipients = [
      ...new Set(
        [task.created_by, task.assigned_to].filter(Boolean) as number[]
      ),
    ]

    for (const uid of recipients) {
      if (await alreadyQueued(db, task.id, uid, 'overdue')) continue
      await db.from('notifications').insert({
        user_id: uid,
        task_id: task.id,
        type:    'overdue',
        message: `🔴 Overdue task\n<b>${escapeHtml(task.title)}</b>`,
      })
      stats.queued_overdue++
    }
  }

  // ── 3. Отправляем все неотправленные уведомления ───────────
  const { data: pending } = await db
    .from('notifications')
    .select('*')
    .eq('sent', false)
    .order('created_at', { ascending: true })
    .limit(50) // не более 50 за один вызов — защита от спама

  for (const notif of pending ?? []) {
    // Синтетические (не-Telegram) пользователи: помечаем отправленным, пропускаем
    if (notif.user_id < 0) {
      await db.from('notifications').update({ sent: true }).eq('id', notif.id)
      stats.skipped_synthetic++
      continue
    }

    const ok = await sendTgMessage(notif.user_id, notif.message)
    // Помечаем отправленным независимо от результата —
    // неуспешные отправки логируются в stats.failed,
    // но не блокируют очередь (избегаем бесконечного retry).
    await db.from('notifications').update({ sent: true }).eq('id', notif.id)
    ok ? stats.sent++ : stats.failed++
  }

  return NextResponse.json({
    ok:        true,
    timestamp: now.toISOString(),
    ...stats,
  })
}