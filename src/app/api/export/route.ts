import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { exportTasksToText } from '@/lib/utils'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const listId = searchParams.get('listId')
  const userId = searchParams.get('userId')

  if (!listId || !userId) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const db = createServiceClient()

  const { data: member } = await db
    .from('list_members').select('role')
    .eq('list_id', listId).eq('user_id', userId).single()

  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: list } = await db
    .from('task_lists').select('title').eq('id', listId).single()

  const { data: tasks } = await db
    .from('tasks')
    .select('*, subtasks(*)')
    .eq('list_id', listId)
    .order('position', { ascending: true })

  const text = exportTasksToText(list?.title ?? 'Tasks', tasks ?? [])

  return new NextResponse(text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${list?.title ?? 'tasks'}.txt"`,
    },
  })
}
