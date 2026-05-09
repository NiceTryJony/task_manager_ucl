import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// GET /api/lists/share?listId=...&userId=...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const listId  = searchParams.get('listId')
  const userId  = searchParams.get('userId')

  if (!listId || userId == null) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const db = createServiceClient()

  // Verify requester is a member
  const { data: myMembership } = await db
    .from('list_members')
    .select('role')
    .eq('list_id', listId)
    .eq('user_id', userId)
    .single()

  if (!myMembership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Fetch all memberships for this list
  const { data: memberships, error } = await db
    .from('list_members')
    .select('role, joined_at, user_id')
    .eq('list_id', listId)
    .order('joined_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!memberships?.length) {
    return NextResponse.json({ members: [], myRole: myMembership.role })
  }

  // Fetch user info separately to avoid FK join issues
  const userIds = memberships.map(m => m.user_id)
  const { data: users } = await db
    .from('users')
    .select('id, first_name, username')
    .in('id', userIds)

  const usersMap = new Map((users ?? []).map(u => [u.id, u]))

  const members = memberships.map(m => ({
    role:      m.role,
    joined_at: m.joined_at,
    user_id:   m.user_id,
    users:     usersMap.get(m.user_id) ?? {
      id:         m.user_id,
      first_name: `User ${m.user_id}`,
      username:   null,
    },
  }))

  return NextResponse.json({ members, myRole: myMembership.role })
}

export async function POST(req: NextRequest) {
  const { listId, ownerId, invitedUserId, role } = await req.json()

  if (!listId || ownerId == null || !invitedUserId) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const db = createServiceClient()

  const { data: ownerMember } = await db
    .from('list_members').select('role')
    .eq('list_id', listId).eq('user_id', ownerId).single()

  if (!ownerMember || ownerMember.role === 'viewer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: invitedUser } = await db
    .from('users').select('id, first_name, username')
    .eq('id', invitedUserId).single()

  if (!invitedUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const { error } = await db.from('list_members').upsert({
    list_id:    listId,
    user_id:    invitedUserId,
    role:       role ?? 'editor',
    invited_by: ownerId,
  }, { onConflict: 'list_id,user_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: list } = await db
    .from('task_lists').select('title').eq('id', listId).single()

  await db.from('notifications').insert({
    user_id: invitedUserId,
    type:    'shared',
    message: `📋 You've been invited to the list "${list?.title ?? 'Untitled'}"!`,
  })

  return NextResponse.json({ ok: true, user: invitedUser })
}

export async function PATCH(req: NextRequest) {
  const { listId, userId, targetUserId, role } = await req.json()

  if (!listId || userId == null || !targetUserId || !role) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const db = createServiceClient()

  const { data: requester } = await db
    .from('list_members').select('role')
    .eq('list_id', listId).eq('user_id', userId).single()

  if (!requester || requester.role !== 'owner') {
    return NextResponse.json({ error: 'Only owner can change roles' }, { status: 403 })
  }

  const { error } = await db
    .from('list_members')
    .update({ role })
    .eq('list_id', listId)
    .eq('user_id', targetUserId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const listId      = searchParams.get('listId')
  const userId      = searchParams.get('userId')
  const requesterId = searchParams.get('requesterId')

  if (!listId || userId == null || !requesterId) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const db = createServiceClient()

  const { data: requester } = await db
    .from('list_members').select('role')
    .eq('list_id', listId).eq('user_id', requesterId).single()

  const isSelf  = userId === requesterId
  const isOwner = requester?.role === 'owner'

  if (!isSelf && !isOwner) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await db
    .from('list_members').delete()
    .eq('list_id', listId).eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}