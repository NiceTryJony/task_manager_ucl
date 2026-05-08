import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// Simple deterministic hash → negative bigint for browser-only users
function usernameToSyntheticId(username: string): number {
  const clean = username.toLowerCase().replace(/^@/, '')
  let hash = 0
  for (let i = 0; i < clean.length; i++) {
    hash = ((hash << 5) - hash + clean.charCodeAt(i)) | 0
  }
  // Make negative and large enough to not clash with Telegram IDs
  return -(Math.abs(hash) + 1_000_000_000)
}

function validateUsername(username: string): string | null {
  const clean = username.trim().replace(/^@/, '')
  if (clean.length < 3)  return 'Username must be at least 3 characters'
  if (clean.length > 32) return 'Username must be at most 32 characters'
  if (!/^[a-zA-Z0-9_]+$/.test(clean)) return 'Only letters, numbers and underscores allowed'
  return null // valid
}

// POST /api/users/identify — find or create user by username
export async function POST(req: NextRequest) {
  try {
    const { username } = await req.json()
    if (!username) return NextResponse.json({ error: 'Missing username' }, { status: 400 })

    const validationError = validateUsername(username)
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

    const clean = username.trim().replace(/^@/, '').toLowerCase()
    const db    = createServiceClient()

    // 1. Try to find existing user by username (case-insensitive)
    const { data: existing } = await db
      .from('users')
      .select('id, first_name, username')
      .ilike('username', clean)
      .single()

    if (existing) {
      return NextResponse.json({ user: existing, isNew: false })
    }

    // 2. Not found — create with synthetic ID
    const syntheticId = usernameToSyntheticId(clean)

    // Check if synthetic ID already exists (collision safety)
    const { data: byId } = await db
      .from('users')
      .select('id, first_name, username')
      .eq('id', syntheticId)
      .single()

    if (byId) {
      return NextResponse.json({ user: byId, isNew: false })
    }

    // Create new user
    const { data: created, error } = await db
      .from('users')
      .insert({
        id:         syntheticId,
        username:   clean,
        first_name: clean, // use username as display name until TG auth merges
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ user: created, isNew: true })

  } catch (e) {
    console.error('[users/identify]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}