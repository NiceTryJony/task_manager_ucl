import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getUserId } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const userId = getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServiceClient()

  // Только пользователи, состоящие хотя бы в одном списке
  const { data, error } = await db
    .from('users')
    .select('id, username, first_name, created_at, list_members!inner(list_id)')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Дедуп — у одного юзера может быть несколько list_members строк
  const users = (data ?? []).map(({ list_members: _, ...u }) => u)

  return NextResponse.json({ users })
}