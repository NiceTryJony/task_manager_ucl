import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// ── Mention helpers ────────────────────────────────────────────

function extractMentions(text: string): string[] {
  const matches = text.match(/@([a-zA-Z0-9_]+)/g) ?? []
  return [...new Set(matches.map(m => m.slice(1).toLowerCase()))]
}

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

  const { data: mentionedUsers } = await db
    .from('users')
    .select('id, first_name, username')
    .in('username', usernames)

  if (!mentionedUsers?.length) return

  const targets = mentionedUsers.filter(u => u.id !== opts.authorId)
  if (!targets.length) return

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

  if (rows.length) await db.from('notifications').insert(rows)
}

// ── Assignee helpers ───────────────────────────────────────────

/**
 * Fetch assignees for an array of task IDs.
 * Returns a Map<taskId, TaskAssignee[]>
 */
async function fetchAssigneesMap(
  db:      ReturnType<typeof createServiceClient>,
  taskIds: string[]
): Promise<Map<string, Array<{ id: number; first_name: string; username?: string | null }>>> {
  const map = new Map<string, Array<{ id: number; first_name: string; username?: string | null }>>()
  if (!taskIds.length) return map

  const { data: rows } = await db
    .from('task_assignees')
    .select('task_id, user_id')
    .in('task_id', taskIds)

  if (!rows?.length) return map

  const userIds = [...new Set(rows.map(r => r.user_id))]
  const { data: users } = await db
    .from('users')
    .select('id, first_name, username')
    .in('id', userIds)

  const usersMap = new Map((users ?? []).map(u => [u.id, u]))

  for (const row of rows) {
    const user = usersMap.get(row.user_id)
    if (!user) continue
    if (!map.has(row.task_id)) map.set(row.task_id, [])
    map.get(row.task_id)!.push({
      id:         user.id,
      first_name: user.first_name,
      username:   user.username ?? null,
    })
  }

  return map
}

/**
 * Replace all assignees for a task.
 * Returns the set of newly-added user IDs (for notifications).
 */
async function syncAssignees(
  db:          ReturnType<typeof createServiceClient>,
  taskId:      string,
  assigneeIds: number[],
  assignedBy:  number
): Promise<number[]> {
  // Current assignees
  const { data: current } = await db
    .from('task_assignees')
    .select('user_id')
    .eq('task_id', taskId)

  const currentIds = new Set((current ?? []).map(r => r.user_id))
  const nextIds    = new Set(assigneeIds)

  const toAdd    = assigneeIds.filter(id => !currentIds.has(id))
  const toRemove = [...currentIds].filter(id => !nextIds.has(id))

  if (toRemove.length) {
    await db
      .from('task_assignees')
      .delete()
      .eq('task_id', taskId)
      .in('user_id', toRemove)
  }

  if (toAdd.length) {
    await db.from('task_assignees').insert(
      toAdd.map(uid => ({
        task_id:     taskId,
        user_id:     uid,
        assigned_by: assignedBy,
      }))
    )
  }

  return toAdd // newly added → notify these
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

  const taskList = tasks ?? []
  const taskIds  = taskList.map(t => t.id)

  // Enrich subtasks with creator info
  const allSubtasks = taskList.flatMap(t => t.subtasks ?? [])
  const creatorIds  = [...new Set(allSubtasks.map((s: any) => s.created_by).filter(Boolean))]

  let creatorsMap = new Map()
  if (creatorIds.length) {
    const { data: creators } = await db
      .from('users').select('id, first_name, username').in('id', creatorIds)
    creatorsMap = new Map((creators ?? []).map(u => [u.id, u]))
  }

  // Fetch multi-assignees
  const assigneesMap = await fetchAssigneesMap(db, taskIds)

  const enriched = taskList.map(t => ({
    ...t,
    subtasks: (t.subtasks ?? []).map((s: any) => ({
      ...s,
      creator: s.created_by ? (creatorsMap.get(s.created_by) ?? null) : null,
    })),
    assignees: assigneesMap.get(t.id) ?? [],
    // Keep legacy field for components not yet migrated
    assigned_user: (() => {
      const list = assigneesMap.get(t.id) ?? []
      return list[0] ?? null
    })(),
  }))

  return NextResponse.json({ tasks: enriched })
}

// ── POST ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    listId, userId, title, description,
    priority, due_at, creator_tz,
    assignee_ids,        // number[]
  } = body

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
      // Keep legacy column in sync with first assignee for any old queries
      assigned_to: Array.isArray(assignee_ids) && assignee_ids.length > 0
        ? assignee_ids[0]
        : null,
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

  // Insert assignees
  const ids: number[] = Array.isArray(assignee_ids) ? assignee_ids : []
  if (ids.length) {
    await db.from('task_assignees').insert(
      ids.map(uid => ({
        task_id:     task.id,
        user_id:     uid,
        assigned_by: userId,
      }))
    )

    // Notify each assignee (except self)
    const { data: author } = await db
      .from('users').select('first_name').eq('id', userId).single()

    const toNotify = ids.filter(uid => uid !== userId)
    if (toNotify.length) {
      await db.from('notifications').insert(
        toNotify.map(uid => ({
          user_id: uid,
          task_id: task.id,
          type:    'assigned',
          message: `📌 <b>${author?.first_name ?? 'Хтось'}</b> призначив вас виконавцем: "<b>${
            title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          }</b>"`,
        }))
      )
    }
  }

  // Notify due-soon
  if (due_at) {
    await db.from('notifications').insert({
      user_id: userId,
      task_id: task.id,
      type:    'due_soon',
      message: `⏰ Нагадування: завдання "<b>${title.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</b>" скоро завершується`,
    })
  }

  // Notify mentions in description
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
  const { taskId, userId, assignee_ids, ...updates } = body

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

  // Update the main task row (only non-assignee fields)
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

  // ── Sync assignees ─────────────────────────────────────────
  if (Array.isArray(assignee_ids)) {
    const newlyAdded = await syncAssignees(db, taskId, assignee_ids, userId)

    // Keep legacy column in sync
    await db
      .from('tasks')
      .update({ assigned_to: assignee_ids[0] ?? null })
      .eq('id', taskId)

    // Notify newly added assignees (skip self)
    const toNotify = newlyAdded.filter(uid => uid !== userId)
    if (toNotify.length) {
      const { data: author } = await db
        .from('users').select('first_name').eq('id', userId).single()

      await db.from('notifications').insert(
        toNotify.map(uid => ({
          user_id: uid,
          task_id: taskId,
          type:    'assigned',
          message: `📌 <b>${author?.first_name ?? 'Хтось'}</b> призначив вас виконавцем: "<b>${
            updated.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          }</b>"`,
        }))
      )
    }
  }

  // Notify mentions on description change
  const descriptionChanged =
    'description' in updates &&
    updates.description !== task.description &&
    updates.description

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

  // task_assignees rows are deleted automatically via ON DELETE CASCADE
  const { error } = await db.from('tasks').delete().eq('id', taskId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}