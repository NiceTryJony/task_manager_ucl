// middleware.ts (корень проекта)
import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { rateLimit } from '@/lib/rate-limit'

const PUBLIC_ROUTES = ['/api/auth', '/api/cron']
const DEV_USER_ID  = 1 // мок для разработки

function verifyTelegramInitData(initData: string): {
  valid: boolean
  userId?: number
  user?:   Record<string, unknown>
} {
  try {
    const params   = new URLSearchParams(initData)
    const hash     = params.get('hash')
    if (!hash) return { valid: false }

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

    if (expectedHash !== hash) return { valid: false }

    const authDate = Number(params.get('auth_date'))
    if (Date.now() / 1000 - authDate > 3600) return { valid: false }

    const user = JSON.parse(decodeURIComponent(params.get('user') ?? '{}'))
    return { valid: true, userId: user.id, user }
  } catch {
    return { valid: false }
  }
}

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname

  // Пропускаем публичные роуты
  if (PUBLIC_ROUTES.some(r => path.startsWith(r))) {
    return NextResponse.next()
  }

  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  if (!rateLimit(ip, 120, 60_000)) {
    return new NextResponse('Too Many Requests', { status: 429 })
    }

  // Dev-режим с мок-пользователем
  if (process.env.NODE_ENV === 'development') {
    const res = NextResponse.next()
    res.headers.set('x-user-id', String(DEV_USER_ID))
    return res
  }

  // Проверяем initData из заголовка
  const initData = req.headers.get('x-telegram-init-data')

  // Fallback: userId из заголовка для уже авторизованных клиентов
  // (после внедрения JWT это заменится)
  const { valid, userId } = initData
    ? verifyTelegramInitData(initData)
    : { valid: false, userId: undefined }

  // ← ДОБАВЬ: fallback для PIN-юзеров
  const fallbackUserId = req.headers.get('x-user-id')

  const res = NextResponse.next()
  if (valid && userId) {
    res.headers.set('x-user-id', String(userId))
    res.headers.set('x-auth-verified', 'true')
  } else if (fallbackUserId) {
    res.headers.set('x-user-id', fallbackUserId)
    res.headers.set('x-auth-verified', 'false')
  } else {
    res.headers.set('x-auth-verified', 'false')
  }
  return res

  // const res3 = NextResponse.next()
  // res3.headers.set('x-user-id', String(userId))
  // res3.headers.set('x-auth-verified', 'true')
  // return res3
}

export const config = {
  matcher: ['/api/:path*'],
}