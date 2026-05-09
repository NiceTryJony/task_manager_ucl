import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const listId   = searchParams.get('listId')
  const userId   = searchParams.get('userId')
  const archived = searchParams.get('archived') === 'true'

  if (!listId || userId == null) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

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

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { listId, userId, title, description, priority, due_at, creator_tz } = body

  if (!listId || userId == null || !title) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const db = createServiceClient()

  const { data: member } = await db
    .from('list_members').select('role')
    .eq('list_id', listId).eq('user_id', userId).single()

  if (!member || member.role === 'viewer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

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

  if (due_at) {
    await db.from('notifications').insert({
      user_id: userId,
      task_id: task.id,
      type:    'due_soon',
      message: `⏰ Reminder: "${title}" is due soon`,
    })
  }

  return NextResponse.json({ task })
}

const TRACKED_FIELDS = ['title', 'description', 'priority', 'status', 'due_at', 'archived'] as const

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { taskId, userId, ...updates } = body

  if (!taskId || userId == null) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const db = createServiceClient()

  const { data: task } = await db.from('tasks').select('*').eq('id', taskId).single()
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: member } = await db
    .from('list_members').select('role')
    .eq('list_id', task.list_id).eq('user_id', userId).single()

  if (!member || member.role === 'viewer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: updated, error } = await db
    .from('tasks').update(updates).eq('id', taskId).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log history for tracked fields — now includes action_type
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

  return NextResponse.json({ task: updated })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const taskId = searchParams.get('taskId')
  const userId = searchParams.get('userId')

  if (!taskId || userId == null) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  const db = createServiceClient()

  const { data: task } = await db.from('tasks').select('list_id').eq('id', taskId).single()
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: member } = await db
    .from('list_members').select('role')
    .eq('list_id', task.list_id).eq('user_id', userId).single()

  if (!member || member.role === 'viewer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await db.from('tasks').delete().eq('id', taskId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}