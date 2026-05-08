import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// GET /api/users/search?q=username_or_id&userId=...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q      = searchParams.get('q')?.trim().replace(/^@/, '')
  const userId = searchParams.get('userId')

  if (!q || userId == null) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const db = createServiceClient()

  // Try numeric ID first
  const numericId = Number(q)

  let user = null

  if (!isNaN(numericId) && numericId > 0) {
    // Search by Telegram ID
    const { data } = await db
      .from('users')
      .select('id, first_name, username')
      .eq('id', numericId)
      .single()
    user = data
  }

  if (!user) {
    // Search by username (case-insensitive)
    const { data } = await db
      .from('users')
      .select('id, first_name, username')
      .ilike('username', q)
      .limit(1)
      .single()
    user = data
  }

  if (!user) {
    return NextResponse.json({ user: null })
  }

  return NextResponse.json({ user })
}
