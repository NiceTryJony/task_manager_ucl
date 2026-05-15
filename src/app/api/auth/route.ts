import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { createServiceClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { initData } = await req.json()

    const db = createServiceClient()

    // No initData = old TG version or browser — create guest user
    if (!initData) {
      await db.from('users').upsert(
        { id: 0, first_name: 'Guest', username: null },
        { onConflict: 'id', ignoreDuplicates: true }
      )
      return NextResponse.json({ ok: true, user: { id: 0, first_name: 'Guest' } })
    }

    // Verify HMAC-SHA256
    const params = new URLSearchParams(initData)
    const hash = params.get('hash')
    if (!hash) return NextResponse.json({ ok: false, error: 'No hash' }, { status: 400 })

    params.delete('hash')
    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')

    const secretKey = createHmac('sha256', 'WebAppData')
      .update(process.env.BOT_TOKEN!)
      .digest()

    const expectedHash = createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex')

    if (expectedHash !== hash) {
      return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 403 })
    }

    const authDate = Number(params.get('auth_date'))
    if (Date.now() / 1000 - authDate > 3600) {
      return NextResponse.json({ ok: false, error: 'Expired' }, { status: 403 })
    }

    const userData = JSON.parse(decodeURIComponent(params.get('user') ?? '{}'))
    if (!userData.id) return NextResponse.json({ ok: false, error: 'No user' }, { status: 400 })

    await db.from('users').upsert({
      id:         userData.id,
      username:   userData.username ?? null,
      first_name: userData.first_name ?? '',
      last_name:  userData.last_name ?? null,
    }, { onConflict: 'id', ignoreDuplicates: false })

    return NextResponse.json({ ok: true, user: userData })
  } catch (e) {
    console.error('[auth/validate]', e)
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 })
  }
}
