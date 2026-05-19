import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getUserId } from '@/lib/auth'

// GET /api/users/search?q=...&userId=...&multi=true
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q      = searchParams.get('q')?.trim().replace(/^@/, '')
  const userId   = getUserId(req)
  const multi  = searchParams.get('multi') === 'true'

  if (!q) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const db = createServiceClient()

  // Exact numeric ID lookup
  const numericId = Number(q)
  if (!isNaN(numericId) && numericId > 0 && !multi) {
    const { data } = await db
      .from('users')
      .select('id, first_name, username')
      .eq('id', numericId)
      .single()
    if (data) return NextResponse.json({ user: data, users: [data] })
  }

  // Multi mode: prefix search — returns up to 8 results
  if (multi) {
    // const { data } = await db
      // .from('users')
      // .select('id, first_name, username')
      // .ilike('username', `${q}%`)
      //.neq('id', Number(userId))
      let query = db.from('users').select('id, first_name, username').ilike('username', `${q}%`).limit(8)
      if (userId !== null) {
        query = query.neq('id', userId)
      }
      const { data } = await query
      .limit(8)

    return NextResponse.json({ users: data ?? [] })
  }

  // Single mode (legacy): exact match
  const { data } = await db
    .from('users')
    .select('id, first_name, username')
    .ilike('username', q)
    .limit(1)
    .single()

  return NextResponse.json({ user: data ?? null })
}