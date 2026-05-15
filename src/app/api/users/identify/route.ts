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
import { createHash } from 'crypto'
import { createServiceClient } from '@/lib/supabase'

// sha256(username:pin) — lightweight, no extra deps
function hashPin(username: string, pin: string): string {
  const salt = process.env.PIN_SALT || 'taskflow-2024-default'
  return createHash('sha256')
    .update(`${salt}:${username.toLowerCase()}:${pin}`)
    .digest('hex')
}

function syntheticId(username: string): number {
  const clean = username.toLowerCase()
  let hash = 0
  for (let i = 0; i < clean.length; i++) {
    hash = ((hash << 5) - hash + clean.charCodeAt(i)) | 0
  }
  return -(Math.abs(hash) + 1_000_000_000)
}

function validateUsername(u: string): string | null {
  if (u.length < 3)  return 'Username must be at least 3 characters'
  if (u.length > 32) return 'Username must be at most 32 characters'
  if (!/^[a-zA-Z0-9_]+$/.test(u)) return 'Only letters, numbers and underscores'
  return null
}

// POST — login or register
export async function POST(req: NextRequest) {
  try {
    const { username, first_name, pin } = await req.json()

    if (!username || !pin) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }
    if (!/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: 'PIN must be 4 digits' }, { status: 400 })
    }

    const clean  = username.trim().replace(/^@/, '').toLowerCase()
    const valErr = validateUsername(clean)
    if (valErr) return NextResponse.json({ error: valErr }, { status: 400 })

    const db       = createServiceClient()
    const pinHash  = hashPin(clean, pin)

    // Look up existing user
    const { data: existing } = await db
      .from('users')
      .select('id, first_name, username, pin_hash')
      .ilike('username', clean)
      .single()

    if (existing) {
      // User exists — verify PIN
      if (!existing.pin_hash) {
        // Legacy user without PIN — set it now (migration path)
        await db.from('users').update({ pin_hash: pinHash }).eq('id', existing.id)
        return NextResponse.json({ user: existing, isNew: false })
      }
      if (existing.pin_hash !== pinHash) {
        return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 })
      }
      return NextResponse.json({ user: existing, isNew: false })
    }

    // New user — create
    const cleanName = (first_name ?? clean).trim()
    const id        = syntheticId(clean)

    // Collision check
    const { data: byId } = await db.from('users').select('id').eq('id', id).single()
    if (byId) {
      // Extremely rare collision — append offset
      return NextResponse.json({ error: 'ID collision — try a slightly different username' }, { status: 409 })
    }

    const { data: created, error } = await db
      .from('users')
      .insert({ id, username: clean, first_name: cleanName, pin_hash: pinHash })
      .select('id, first_name, username')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ user: created, isNew: true })

  } catch (e) {
    console.error('[identify POST]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// PATCH — update profile (requires current PIN)
export async function PATCH(req: NextRequest) {
  try {
    const { userId, current_pin, first_name, new_pin } = await req.json()

    if (!userId || !current_pin) {
      return NextResponse.json({ error: 'Missing userId or current_pin' }, { status: 400 })
    }

    const db = createServiceClient()

    const { data: user } = await db
      .from('users')
      .select('id, username, first_name, pin_hash')
      .eq('id', userId)
      .single()

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    // Verify current PIN
    const currentHash = hashPin(user.username!, current_pin)
    if (user.pin_hash && user.pin_hash !== currentHash) {
      return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 })
    }

    const updates: Record<string, string> = {}
    if (first_name && first_name.trim() !== user.first_name) {
      updates.first_name = first_name.trim()
    }
    if (new_pin) {
      if (!/^\d{4}$/.test(new_pin)) {
        return NextResponse.json({ error: 'New PIN must be 4 digits' }, { status: 400 })
      }
      updates.pin_hash = hashPin(user.username!, new_pin)
    }

    if (!Object.keys(updates).length) {
      return NextResponse.json({ user })
    }

    const { data: updated, error } = await db
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select('id, first_name, username')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ user: updated })

  } catch (e) {
    console.error('[identify PATCH]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}