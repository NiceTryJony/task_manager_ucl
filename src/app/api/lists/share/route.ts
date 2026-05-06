import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// POST — invite user to list
export async function POST(req: NextRequest) {
  const { listId, ownerId, invitedUserId, role } = await req.json()

  if (!listId || !ownerId || !invitedUserId) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const db = createServiceClient()

  // Must be owner or editor to invite
  const { data: ownerMember } = await db
    .from('list_members').select('role')
    .eq('list_id', listId).eq('user_id', ownerId).single()

  if (!ownerMember || ownerMember.role === 'viewer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Check if invited user exists in DB (must have opened app before)
  const { data: invitedUser } = await db
    .from('users').select('id, first_name, username')
    .eq('id', invitedUserId).single()

  if (!invitedUser) {
    return NextResponse.json({
      error: 'User not found. They must open TaskFlow first.',
    }, { status: 404 })
  }

  // Upsert membership
  const { error } = await db.from('list_members').upsert({
    list_id:    listId,
    user_id:    invitedUserId,
    role:       role ?? 'editor',
    invited_by: ownerId,
  }, { onConflict: 'list_id,user_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Get list info for notification
  const { data: list } = await db
    .from('task_lists').select('title').eq('id', listId).single()

  // Queue Telegram notification
  await db.from('notifications').insert({
    user_id: invitedUserId,
    type:    'shared',
    message: `📋 You've been invited to the list "${list?.title ?? 'Untitled'}"!`,
  })

  return NextResponse.json({ ok: true, user: invitedUser })
}

// DELETE — remove member
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const listId   = searchParams.get('listId')
  const userId   = searchParams.get('userId')    // person being removed
  const requesterId = searchParams.get('requesterId')  // person removing

  if (!listId || !userId || !requesterId) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const db = createServiceClient()

  // Can remove self (leave) or owner can remove others
  const { data: requester } = await db
    .from('list_members').select('role')
    .eq('list_id', listId).eq('user_id', requesterId).single()

  const isSelf    = userId === requesterId
  const isOwner   = requester?.role === 'owner'

  if (!isSelf && !isOwner) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await db
    .from('list_members')
    .delete()
    .eq('list_id', listId)
    .eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
