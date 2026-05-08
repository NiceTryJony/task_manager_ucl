// import { NextRequest, NextResponse } from 'next/server'
// import { createServiceClient } from '@/lib/supabase'

// // Simple deterministic hash → negative bigint for browser-only users
// function usernameToSyntheticId(username: string): number {
//   const clean = username.toLowerCase().replace(/^@/, '')
//   let hash = 0
//   for (let i = 0; i < clean.length; i++) {
//     hash = ((hash << 5) - hash + clean.charCodeAt(i)) | 0
//   }
//   // Make negative and large enough to not clash with Telegram IDs
//   return -(Math.abs(hash) + 1_000_000_000)
// }

// function validateUsername(username: string): string | null {
//   const clean = username.trim().replace(/^@/, '')
//   if (clean.length < 3)  return 'Username must be at least 3 characters'
//   if (clean.length > 32) return 'Username must be at most 32 characters'
//   if (!/^[a-zA-Z0-9_]+$/.test(clean)) return 'Only letters, numbers and underscores allowed'
//   return null // valid
// }

// // POST /api/users/identify — find or create user by username
// export async function POST(req: NextRequest) {
//   try {
//     const { username } = await req.json()
//     if (!username) return NextResponse.json({ error: 'Missing username' }, { status: 400 })

//     const validationError = validateUsername(username)
//     if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

//     const clean = username.trim().replace(/^@/, '').toLowerCase()
//     const db    = createServiceClient()

//     // 1. Try to find existing user by username (case-insensitive)
//     const { data: existing } = await db
//       .from('users')
//       .select('id, first_name, username')
//       .ilike('username', clean)
//       .single()

//     if (existing) {
//       return NextResponse.json({ user: existing, isNew: false })
//     }

//     // 2. Not found — create with synthetic ID
//     const syntheticId = usernameToSyntheticId(clean)

//     // Check if synthetic ID already exists (collision safety)
//     const { data: byId } = await db
//       .from('users')
//       .select('id, first_name, username')
//       .eq('id', syntheticId)
//       .single()

//     if (byId) {
//       return NextResponse.json({ user: byId, isNew: false })
//     }

//     // Create new user
//     const { data: created, error } = await db
//       .from('users')
//       .insert({
//         id:         syntheticId,
//         username:   clean,
//         first_name: clean, // use username as display name until TG auth merges
//       })
//       .select()
//       .single()

//     if (error) return NextResponse.json({ error: error.message }, { status: 500 })
//     return NextResponse.json({ user: created, isNew: true })

//   } catch (e) {
//     console.error('[users/identify]', e)
//     return NextResponse.json({ error: 'Internal error' }, { status: 500 })
//   }
// }











import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

function usernameToSyntheticId(username: string): number {
  const clean = username.toLowerCase().replace(/^@/, '')
  let hash = 0
  for (let i = 0; i < clean.length; i++) {
    hash = ((hash << 5) - hash + clean.charCodeAt(i)) | 0
  }
  return -(Math.abs(hash) + 1_000_000_000)
}

function validateUsername(username: string): string | null {
  const clean = username.trim().replace(/^@/, '')
  if (clean.length < 3)  return 'Username must be at least 3 characters'
  if (clean.length > 32) return 'Username must be at most 32 characters'
  if (!/^[a-zA-Z0-9_]+$/.test(clean)) return 'Only letters, numbers and underscores allowed'
  return null
}

// POST — find or create user by username + first_name
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { username, first_name } = body

    if (!username) return NextResponse.json({ error: 'Missing username' }, { status: 400 })

    const validationError = validateUsername(username)
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

    const clean     = username.trim().replace(/^@/, '').toLowerCase()
    const cleanName = (first_name ?? clean).trim()
    const db        = createServiceClient()

    // 1. Try to find existing user by username
    const { data: existing } = await db
      .from('users')
      .select('id, first_name, username')
      .ilike('username', clean)
      .single()

    if (existing) {
      // Update first_name if provided and different
      if (cleanName && cleanName !== existing.first_name) {
        await db.from('users').update({ first_name: cleanName }).eq('id', existing.id)
        return NextResponse.json({ user: { ...existing, first_name: cleanName }, isNew: false })
      }
      return NextResponse.json({ user: existing, isNew: false })
    }

    // 2. Create with synthetic ID
    const syntheticId = usernameToSyntheticId(clean)

    const { data: byId } = await db
      .from('users')
      .select('id, first_name, username')
      .eq('id', syntheticId)
      .single()

    if (byId) {
      return NextResponse.json({ user: byId, isNew: false })
    }

    const { data: created, error } = await db
      .from('users')
      .insert({ id: syntheticId, username: clean, first_name: cleanName })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ user: created, isNew: true })

  } catch (e) {
    console.error('[users/identify POST]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// PATCH — update existing user profile (called from SettingsSheet)
export async function PATCH(req: NextRequest) {
  try {
    const { userId, username, first_name } = await req.json()

    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

    const db = createServiceClient()

    // Check the user exists
    const { data: existing } = await db
      .from('users')
      .select('id, first_name, username')
      .eq('id', userId)
      .single()

    if (!existing) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const updates: Record<string, string> = {}

    if (first_name && first_name.trim() !== existing.first_name) {
      updates.first_name = first_name.trim()
    }

    if (username) {
      const cleanUn = username.trim().replace(/^@/, '').toLowerCase()
      const validErr = validateUsername(cleanUn)
      if (validErr) return NextResponse.json({ error: validErr }, { status: 400 })

      if (cleanUn !== existing.username) {
        // Check new username isn't taken by a different user
        const { data: taken } = await db
          .from('users')
          .select('id')
          .ilike('username', cleanUn)
          .single()

        if (taken && taken.id !== userId) {
          return NextResponse.json({ error: 'Username already taken' }, { status: 409 })
        }

        updates.username = cleanUn
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ user: existing })
    }

    const { data: updated, error } = await db
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ user: updated })

  } catch (e) {
    console.error('[users/identify PATCH]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}