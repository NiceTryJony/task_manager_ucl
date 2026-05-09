import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// ── Mention helpers ────────────────────────────────────────────

/**
 * Extracts all @username mentions from a string.
 * Returns lowercase usernames without the @ prefix.
 * Example: "hey @alice and @Bob!" → ["alice", "bob"]
 */
function extractMentions(text: string): string[] {
  const matches = text.match(/@([a-zA-Z0-9_]+)/g) ?? []
  return [...new Set(matches.map(m => m.slice(1).toLowerCase()))]
}

/**
 * Creates mention notifications for all @username mentions found in a text.
 * Skips the author themselves, users not in the database, and duplicate
 * mentions that already have an unsent notification for this task.
 */
async function notifyMentions(
  db: ReturnType<typeof createServiceClient>,
  opts: {
    text:        string
    taskId:      string
    taskTitle:   string
    authorId:    number
    authorName:  string
  }
) {
  const usernames = extractMentions(opts.text)
  if (!usernames.length) return

  // Resolve usernames to user rows
  const { data: mentionedUsers } = await db
    .from('users')
    .select('id, first_name, username')
    .in('username', usernames)

  if (!mentionedUsers?.length) return

  // Skip the author themselves
  const targets = mentionedUsers.filter(u => u.id !== opts.authorId)
  if (!targets.length) return

  // Avoid duplicate unsent notifications for the same task+user
  const { data: existing } = await db
    .from('notifications')
    .select('user_id')
    .eq('task_id', opts.taskId)
    .eq('type', 'mention')
    .eq('sent', false)
    .in('user_id', targets.map(u => u.id))

  const alreadyNotified = new Set((existing ?? []).map(n => n.user_id))

  const rows = targets
    .filter(u => !alreadyNotified.has(u.id))
    .map(u => ({
      user_id: u.id,
      task_id: opts.taskId,
      type:    'mention' as const,
      message: `💬 ${opts.authorName} mentioned you in "${opts.taskTitle}"`,
    }))

  if (rows.length) {
    await db.from('notifications').insert(rows)
  }
}

// ── GET ────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const listId   = searchParams.get('listId')
  const userId   = searchParams.get('userId')
  const archived = searchParams.get('archived') === 'true'

  if (!listId || userId == null) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const db = createServiceClient()

  const { data: member } = await db
    .from('list_members').select('role')
    .eq('list_id', listId).eq('user_id', userId).single()

  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: tasks, error } = await db
    .from('tasks')
    .select('*, subtasks(*)')
    .eq('list_id', listId)
    .eq('archived', archived)
    .order('position', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enrich subtasks with creator info
  const allSubtasks = (tasks ?? []).flatMap(t => t.subtasks ?? [])
  const creatorIds  = [...new Set(allSubtasks.map((s: any) => s.created_by).filter(Boolean))]

  let creatorsMap = new Map()
  if (creatorIds.length) {
    const { data: creators } = await db
      .from('users').select('id, first_name, username').in('id', creatorIds)
    creatorsMap = new Map((creators ?? []).map(u => [u.id, u]))
  }

  const enriched = (tasks ?? []).map(t => ({
    ...t,
    subtasks: (t.subtasks ?? []).map((s: any) => ({
      ...s,
      creator: s.created_by ? (creatorsMap.get(s.created_by) ?? null) : null,
    })),
  }))

  return NextResponse.json({ tasks: enriched })
}

// ── POST ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { listId, userId, title, description, priority, due_at, creator_tz } = body

  if (!listId || userId == null || !title) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const db = createServiceClient()

  const { data: member } = await db
    .from('list_members').select('role')
    .eq('list_id', listId).eq('user_id', userId).single()

  if (!member || member.role === 'viewer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: last } = await db
    .from('tasks').select('position')
    .eq('list_id', listId).order('position', { ascending: false }).limit(1).single()

  const { data: task, error } = await db
    .from('tasks')
    .insert({
      list_id:     listId,
      title,
      description: description ?? null,
      priority:    priority ?? 'medium',
      due_at:      due_at ?? null,
      creator_tz:  creator_tz ?? 'UTC',
      position:    (last?.position ?? -1) + 1,
      created_by:  userId,
    })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log creation
  try {
    await db.from('task_history').insert({
      task_id:     task.id,
      user_id:     userId,
      action_type: 'task_created',
      new_value:   title,
    })
  } catch {}

  // Notify due-soon watchers
  if (due_at) {
    await db.from('notifications').insert({
      user_id: userId,
      task_id: task.id,
      type:    'due_soon',
      message: `⏰ Reminder: "${title}" is due soon`,
    })
  }

  // Notify mentioned users
  if (description) {
    const { data: author } = await db
      .from('users').select('first_name').eq('id', userId).single()

    await notifyMentions(db, {
      text:       description,
      taskId:     task.id,
      taskTitle:  title,
      authorId:   userId,
      authorName: author?.first_name ?? 'Someone',
    })
  }

  return NextResponse.json({ task })
}

// ── PATCH ──────────────────────────────────────────────────────

const TRACKED_FIELDS = ['title', 'description', 'priority', 'status', 'due_at', 'archived'] as const

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { taskId, userId, ...updates } = body

  if (!taskId || userId == null) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const db = createServiceClient()

  const { data: task } = await db.from('tasks').select('*').eq('id', taskId).single()
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: member } = await db
    .from('list_members').select('role')
    .eq('list_id', task.list_id).eq('user_id', userId).single()

  if (!member || member.role === 'viewer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: updated, error } = await db
    .from('tasks').update(updates).eq('id', taskId).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log history for tracked fields
  const historyEntries = TRACKED_FIELDS
    .filter(f => f in updates && String(updates[f] ?? '') !== String(task[f] ?? ''))
    .map(f => ({
      task_id:     taskId,
      user_id:     userId,
      action_type: 'field_change',
      field:       f,
      old_value:   task[f] != null ? String(task[f]) : null,
      new_value:   updates[f] != null ? String(updates[f]) : null,
    }))

  if (historyEntries.length) {
    try { await db.from('task_history').insert(historyEntries) } catch {}
  }

  // Notify newly-mentioned users when description changes
  const descriptionChanged = 'description' in updates
    && updates.description !== task.description
    && updates.description

  if (descriptionChanged) {
    const { data: author } = await db
      .from('users').select('first_name').eq('id', userId).single()

    await notifyMentions(db, {
      text:       updates.description as string,
      taskId:     taskId,
      taskTitle:  updated.title,
      authorId:   userId,
      authorName: author?.first_name ?? 'Someone',
    })
  }

  return NextResponse.json({ task: updated })
}

// ── DELETE ─────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const taskId = searchParams.get('taskId')
  const userId = searchParams.get('userId')

  if (!taskId || userId == null) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const db = createServiceClient()

  const { data: task } = await db.from('tasks').select('list_id').eq('id', taskId).single()
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: member } = await db
    .from('list_members').select('role')
    .eq('list_id', task.list_id).eq('user_id', userId).single()

  if (!member || member.role === 'viewer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await db.from('tasks').delete().eq('id', taskId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}