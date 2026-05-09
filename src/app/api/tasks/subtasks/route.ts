import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

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
  return NextResponse.json({ subtask })
}

export async function PATCH(req: NextRequest) {
  const { subtaskId, userId, ...updates } = await req.json()
  if (!subtaskId || userId == null) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const db = createServiceClient()

  const { data: subtask } = await db
    .from('subtasks').select('task_id').eq('id', subtaskId).single()
  if (!subtask) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: task } = await db
    .from('tasks').select('list_id').eq('id', subtask.task_id).single()

  const { data: member } = await db
    .from('list_members').select('role')
    .eq('list_id', task!.list_id).eq('user_id', userId).single()

  // Viewers CAN toggle subtask completion
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  // Viewers can only update `completed`, not rename/reorder
  if (member.role === 'viewer') {
    const allowedKeys = Object.keys(updates).filter(k => k !== 'completed')
    if (allowedKeys.length > 0) {
      return NextResponse.json({ error: 'Viewers can only toggle completion' }, { status: 403 })
    }
  }

  const { data: updated, error } = await db
    .from('subtasks').update(updates).eq('id', subtaskId).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ subtask: updated })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const subtaskId = searchParams.get('subtaskId')
  const userId    = searchParams.get('userId')
  if (!subtaskId || userId == null) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const db = createServiceClient()

  const { data: subtask } = await db
    .from('subtasks').select('task_id').eq('id', subtaskId).single()
  if (!subtask) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: task } = await db
    .from('tasks').select('list_id').eq('id', subtask.task_id).single()

  const { data: member } = await db
    .from('list_members').select('role')
    .eq('list_id', task!.list_id).eq('user_id', userId).single()

  if (!member || member.role === 'viewer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await db.from('subtasks').delete().eq('id', subtaskId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}