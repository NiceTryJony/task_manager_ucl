// src/app/api/tasks/views/batch/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getUserId } from '@/lib/auth'

// GET /api/tasks/views/batch?listId=...
// Возвращает массив taskId которые текущий юзер уже просматривал в данном списке
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const listId = searchParams.get('listId')
  const userId = getUserId(req)

  if (!listId || !userId) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const db = createServiceClient()

  // Проверяем доступ
  const { data: member } = await db
    .from('list_members').select('role')
    .eq('list_id', listId).eq('user_id', userId).single()

  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Все taskId в этом списке
  const { data: tasks } = await db
    .from('tasks').select('id').eq('list_id', listId)

  if (!tasks?.length) return NextResponse.json({ viewedTaskIds: [] })

  const allTaskIds = tasks.map(t => t.id)

  // Какие из них юзер уже видел
  const { data: views } = await db
    .from('task_views')
    .select('task_id')
    .eq('user_id', userId)
    .in('task_id', allTaskIds)

  const viewedTaskIds = (views ?? []).map(v => v.task_id)

  return NextResponse.json({ viewedTaskIds })
}