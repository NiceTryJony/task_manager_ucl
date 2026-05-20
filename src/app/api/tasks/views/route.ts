// src/app/api/tasks/views/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getUserId } from '@/lib/auth'

// GET /api/tasks/views?taskId=...
// Возвращает список пользователей которые видели задачу
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const taskId = searchParams.get('taskId')
  const userId = getUserId(req)

  if (!taskId || !userId) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const db = createServiceClient()

  // Проверяем доступ к задаче
  const { data: task } = await db
    .from('tasks').select('list_id').eq('id', taskId).single()
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: member } = await db
    .from('list_members').select('role')
    .eq('list_id', task.list_id).eq('user_id', userId).single()
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Получаем все просмотры с данными пользователей
  const { data: views } = await db
    .from('task_views')
    .select('user_id, viewed_at')
    .eq('task_id', taskId)
    .order('viewed_at', { ascending: false })

  if (!views?.length) return NextResponse.json({ views: [] })

  const userIds = views.map(v => v.user_id)
  const { data: users } = await db
    .from('users').select('id, first_name, username').in('id', userIds)

  const usersMap = new Map((users ?? []).map(u => [u.id, u]))

  const enriched = views.map(v => ({
    user_id:   v.user_id,
    viewed_at: v.viewed_at,
    user: usersMap.get(v.user_id) ?? {
      id:         v.user_id,
      first_name: `User ${v.user_id}`,
      username:   null,
    },
  }))

  return NextResponse.json({ views: enriched })
}

// POST /api/tasks/views
// Записывает просмотр задачи текущим пользователем (upsert)
export async function POST(req: NextRequest) {
  const { taskId } = await req.json()
  const userId = getUserId(req)

  if (!taskId || !userId) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const db = createServiceClient()

  // Проверяем доступ
  const { data: task } = await db
    .from('tasks').select('list_id').eq('id', taskId).single()
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: member } = await db
    .from('list_members').select('role')
    .eq('list_id', task.list_id).eq('user_id', userId).single()
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Upsert — если уже есть, обновляем viewed_at
  const { error } = await db
    .from('task_views')
    .upsert(
      { task_id: taskId, user_id: userId, viewed_at: new Date().toISOString() },
      { onConflict: 'task_id,user_id' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}