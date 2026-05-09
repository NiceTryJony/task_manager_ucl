import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// ── Helper: log an action to task_history ─────────────────────
async function logHistory(
  db: ReturnType<typeof createServiceClient>,
  opts: {
    task_id:     string
    user_id:     number
    action_type: string
    field?:      string
    old_value?:  string | null
    new_value?:  string | null
    meta?:       Record<string, unknown>
  }
) {
  try {
    await db.from('task_history').insert({
      task_id:     opts.task_id,
      user_id:     opts.user_id,
      action_type: opts.action_type,
      field:       opts.field ?? null,
      old_value:   opts.old_value ?? null,
      new_value:   opts.new_value ?? null,
      meta:        opts.meta ?? null,
    })
  } catch {
    // History logging is best-effort — never block the main operation
  }
}

// POST — create subtask
export async function POST(req: NextRequest) {
  const { taskId, userId, title } = await req.json()
  if (!taskId || userId == null || !title) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const db = createServiceClient()

  const { data: task } = await db.from('tasks').select('list_id').eq('id', taskId).single()
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  const { data: member } = await db
    .from('list_members').select('role')
    .eq('list_id', task.list_id).eq('user_id', userId).single()
  if (!member || member.role === 'viewer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: last } = await db
    .from('subtasks').select('position')
    .eq('task_id', taskId).order('position', { ascending: false }).limit(1).single()

  const { data: subtask, error } = await db
    .from('subtasks')
    .insert({
      task_id:    taskId,
      title,
      position:   (last?.position ?? -1) + 1,
      created_by: userId,
    })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log history
  await logHistory(db, {
    task_id:     taskId,
    user_id:     userId,
    action_type: 'subtask_added',
    field:       'subtask',
    new_value:   title,
    meta:        { subtask_title: title, subtask_id: subtask.id },
  })

  return NextResponse.json({ subtask })
}

// PATCH — update subtask (toggle, rename, reorder)
export async function PATCH(req: NextRequest) {
  const { subtaskId, userId, ...updates } = await req.json()
  if (!subtaskId || userId == null) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const db = createServiceClient()

  // Fetch current state before update
  const { data: currentSub } = await db
    .from('subtasks').select('*').eq('id', subtaskId).single()
  if (!currentSub) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: task } = await db
    .from('tasks').select('list_id').eq('id', currentSub.task_id).single()

  const { data: member } = await db
    .from('list_members').select('role')
    .eq('list_id', task!.list_id).eq('user_id', userId).single()

  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Viewers can only toggle `completed`
  if (member.role === 'viewer') {
    const nonCompletedKeys = Object.keys(updates).filter(k => k !== 'completed')
    if (nonCompletedKeys.length > 0) {
      return NextResponse.json({ error: 'Viewers can only toggle completion' }, { status: 403 })
    }
  }

  const { data: updated, error } = await db
    .from('subtasks').update(updates).eq('id', subtaskId).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log based on what changed
  const baseMeta = { subtask_title: currentSub.title, subtask_id: subtaskId }

  if ('completed' in updates && Boolean(updates.completed) !== Boolean(currentSub.completed)) {
    await logHistory(db, {
      task_id:     currentSub.task_id,
      user_id:     userId,
      action_type: 'subtask_toggled',
      field:       'completed',
      old_value:   String(currentSub.completed),
      new_value:   String(updates.completed),
      meta:        baseMeta,
    })
  }

  if ('title' in updates && updates.title !== currentSub.title) {
    await logHistory(db, {
      task_id:     currentSub.task_id,
      user_id:     userId,
      action_type: 'subtask_renamed',
      field:       'title',
      old_value:   currentSub.title,
      new_value:   updates.title as string,
      meta:        { ...baseMeta, subtask_title: updates.title as string },
    })
  }

  if ('position' in updates && updates.position !== currentSub.position) {
    await logHistory(db, {
      task_id:     currentSub.task_id,
      user_id:     userId,
      action_type: 'subtask_reordered',
      field:       'position',
      old_value:   String(currentSub.position),
      new_value:   String(updates.position),
      meta:        baseMeta,
    })
  }

  return NextResponse.json({ subtask: updated })
}

// DELETE — remove subtask
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const subtaskId = searchParams.get('subtaskId')
  const userId    = searchParams.get('userId')
  if (!subtaskId || userId == null) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const db = createServiceClient()

  // Fetch subtask title before deleting (for history)
  const { data: subtask } = await db
    .from('subtasks').select('task_id, title').eq('id', subtaskId).single()
  if (!subtask) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: task } = await db
    .from('tasks').select('list_id').eq('id', subtask.task_id).single()

  const { data: member } = await db
    .from('list_members').select('role')
    .eq('list_id', task!.list_id).eq('user_id', Number(userId)).single()

  if (!member || member.role === 'viewer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await db.from('subtasks').delete().eq('id', subtaskId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log history after successful delete
  await logHistory(db, {
    task_id:     subtask.task_id,
    user_id:     Number(userId),
    action_type: 'subtask_deleted',
    field:       'subtask',
    old_value:   subtask.title,
    meta:        { subtask_title: subtask.title, subtask_id: subtaskId },
  })

  return NextResponse.json({ ok: true })
}