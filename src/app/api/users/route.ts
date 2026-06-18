import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getUserId } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const userId = getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServiceClient()

  // Шаг 1: берём уникальные user_id из list_members
  const { data: members, error: membersError } = await db
    .from('list_members')
    .select('user_id')

  if (membersError) {
    console.error('[/api/users] list_members query failed:', membersError)
    return NextResponse.json({ error: membersError.message }, { status: 500 })
  }

  const activeUserIds = [...new Set((members ?? []).map(m => m.user_id))]

  if (activeUserIds.length === 0) {
    return NextResponse.json({ users: [] })
  }

  // Шаг 2: берём только этих юзеров
  const { data: users, error: usersError } = await db
    .from('users')
    .select('id, username, first_name, created_at')
    .in('id', activeUserIds)
    .order('created_at', { ascending: false })

  if (usersError) {
    console.error('[/api/users] users query failed:', usersError)
    return NextResponse.json({ error: usersError.message }, { status: 500 })
  }

  return NextResponse.json({ users: users ?? [] })
}