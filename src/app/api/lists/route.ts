import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getUserId } from '@/lib/auth'

// GET /api/lists?userId=...
export async function GET(req: NextRequest) {
  // const userId = new URL(req.url).searchParams.get('userId')
  const userId = getUserId(req)
  if (userId == null) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

  const db = createServiceClient()

  // Get all lists the user is a member of (owned + shared)
  const { data: memberships } = await db
    .from('list_members')
    .select('list_id, role')
    .eq('user_id', userId)

  if (!memberships?.length) return NextResponse.json({ lists: [] })

  const listIds = memberships.map(m => m.list_id)

  const { data: lists, error } = await db
    .from('task_lists')
    .select('*')
    .in('id', listIds)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Attach task counts
  const { data: counts } = await db
    .from('tasks')
    .select('list_id, status')
    .in('list_id', listIds)

  const listsWithCounts = lists.map(l => ({
    ...l,
    task_count: counts?.filter(t => t.list_id === l.id).length ?? 0,
    done_count: counts?.filter(t => t.list_id === l.id && t.status === 'done').length ?? 0,
  }))

  return NextResponse.json({ lists: listsWithCounts })
}

// POST — create list
export async function POST(req: NextRequest) {
  const userId = getUserId(req)
  const { title, emoji, color } = await req.json()
  if (userId == null || !title) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const db = createServiceClient()

  const { data: list, error } = await db
    .from('task_lists')
    .insert({ owner_id: userId, title, emoji: emoji ?? '📋', color: color ?? '#7B6EF6' })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auto-add owner as member
  await db.from('list_members').insert({
    list_id: list.id,
    user_id: userId,
    role: 'owner',
    invited_by: userId,
  })

  return NextResponse.json({ list })
}

// PATCH — update list meta
export async function PATCH(req: NextRequest) {
  const userId = getUserId(req)
  const { listId, title, emoji, color } = await req.json()
  if (!listId || userId == null) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const db = createServiceClient()

  const { data: member } = await db
    .from('list_members').select('role')
    .eq('list_id', listId).eq('user_id', userId).single()

  if (!member || !['owner', 'editor'].includes(member.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: list, error } = await db
    .from('task_lists')
    .update({ title, emoji, color })
    .eq('id', listId).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ list })
}

// DELETE — delete list
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const listId = searchParams.get('listId')
  // const userId = searchParams.get('userId')
  const userId = getUserId(req)
  if (!listId || userId == null) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  const db = createServiceClient()

  const { data: member } = await db
    .from('list_members').select('role')
    .eq('list_id', listId).eq('user_id', userId).single()

  if (member?.role !== 'owner') return NextResponse.json({ error: 'Only owner can delete' }, { status: 403 })

  const { error } = await db.from('task_lists').delete().eq('id', listId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
