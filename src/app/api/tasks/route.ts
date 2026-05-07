import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// GET /api/tasks?listId=...&userId=...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const listId = searchParams.get('listId')
  const userId = searchParams.get('userId')

  if (!listId || userId == null) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const db = createServiceClient()

  // Check access
  const { data: member } = await db
    .from('list_members')
    .select('role')
    .eq('list_id', listId)
    .eq('user_id', userId)
    .single()

  if (!member) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: tasks, error } = await db
    .from('tasks')
    .select('*, subtasks(*)')
    .eq('list_id', listId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: false, referencedTable: 'subtasks' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tasks })
}

// POST /api/tasks — create task
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { listId, userId, title, description, priority, due_date } = body

  if (!listId || userId == null || !title) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const db = createServiceClient()

  const { data: member } = await db
    .from('list_members')
    .select('role')
    .eq('list_id', listId)
    .eq('user_id', userId)
    .single()

  if (!member || member.role === 'viewer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Get max position
  const { data: last } = await db
    .from('tasks')
    .select('position')
    .eq('list_id', listId)
    .order('position', { ascending: false })
    .limit(1)
    .single()

  const position = (last?.position ?? -1) + 1

  const { data: task, error } = await db
    .from('tasks')
    .insert({
      list_id: listId,
      title,
      description: description ?? null,
      priority: priority ?? 'medium',
      due_date: due_date ?? null,
      position,
      created_by: userId,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Schedule notification if due_date set
  if (due_date) {
    await db.from('notifications').insert({
      user_id: userId,
      task_id: task.id,
      type: 'due_soon',
      message: `⏰ Reminder: "${title}" is due on ${due_date}`,
    })
  }

  return NextResponse.json({ task })
}

// PATCH /api/tasks — update task
export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { taskId, userId, ...updates } = body

  if (!taskId || userId == null) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const db = createServiceClient()

  const { data: task } = await db
    .from('tasks')
    .select('list_id')
    .eq('id', taskId)
    .single()

  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: member } = await db
    .from('list_members')
    .select('role')
    .eq('list_id', task.list_id)
    .eq('user_id', userId)
    .single()

  if (!member || member.role === 'viewer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: updated, error } = await db
    .from('tasks')
    .update(updates)
    .eq('id', taskId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ task: updated })
}

// DELETE /api/tasks
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const taskId = searchParams.get('taskId')
  const userId = searchParams.get('userId')

  if (!taskId || userId == null) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const db = createServiceClient()

  const { data: task } = await db
    .from('tasks')
    .select('list_id')
    .eq('id', taskId)
    .single()

  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: member } = await db
    .from('list_members')
    .select('role')
    .eq('list_id', task.list_id)
    .eq('user_id', userId)
    .single()

  if (!member || member.role === 'viewer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await db.from('tasks').delete().eq('id', taskId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
