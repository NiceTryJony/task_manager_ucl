import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getUserId } from '@/lib/auth'

// GET /api/tasks/history?taskId=...&userId=...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const taskId = searchParams.get('taskId')
  const userId   = getUserId(req)

  if (!taskId || !userId) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const db = createServiceClient()

  // Verify access
  const { data: task } = await db
    .from('tasks').select('list_id').eq('id', taskId).single()
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: member } = await db
    .from('list_members').select('role')
    .eq('list_id', task.list_id).eq('user_id', userId).single()
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Fetch history — include all new columns
  const { data: history, error } = await db
    .from('task_history')
    .select('id, action_type, field, old_value, new_value, meta, created_at, user_id')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!history?.length) return NextResponse.json({ history: [] })

  // Enrich with user info
  const userIds = [...new Set(history.map(h => h.user_id))]
  const { data: users } = await db
    .from('users').select('id, first_name, username').in('id', userIds)
  const usersMap = new Map((users ?? []).map(u => [u.id, u]))

  const enriched = history.map(h => ({
    ...h,
    // Normalise action_type for rows created before the migration
    action_type: (h.action_type ?? 'field_change') as string,
    user: usersMap.get(h.user_id) ?? {
      id:         h.user_id,
      first_name: `User ${h.user_id}`,
      username:   null,
    },
  }))

  return NextResponse.json({ history: enriched })
}