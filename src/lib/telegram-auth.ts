/**
 * Telegram Mini App — initData verification.
 *
 * Spec: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * Kept as a pure utility (no Next.js deps) so it can be used
 * both in middleware.ts (Edge runtime) and in Node.js API routes.
 *
 * NOTE: crypto.createHmac is Node.js only.
 * For Edge runtime (middleware) we use the Web Crypto API variant below.
 */

export interface TelegramUser {
  id:         number
  username?:  string
  first_name: string
  last_name?: string
}

export interface VerifyResult {
  valid:      boolean
  userId?:    number
  user?:      TelegramUser
  reason?:    string
}

/**
 * Verifies Telegram initData using the Web Crypto API.
 * Compatible with both Edge and Node.js runtimes.
 *
 * @param initData  - Raw initData string from Telegram.WebApp.initData
 * @param botToken  - Your bot token from @BotFather
 * @param maxAgeMs  - Maximum allowed age of initData in milliseconds (default: 1 hour)
 */
export async function verifyTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeMs = 60 * 60 * 1000
): Promise<VerifyResult> {
  try {
    if (!initData) return { valid: false, reason: 'empty_init_data' }

    const params   = new URLSearchParams(initData)
    const hash     = params.get('hash')
    if (!hash) return { valid: false, reason: 'no_hash' }

    // Build data-check string (all params except hash, sorted alphabetically)
    params.delete('hash')
    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')

    // Web Crypto API — works in Edge + Node.js 18+
    const encoder   = new TextEncoder()
    const secretKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode('WebAppData'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )

    const secretBytes = await crypto.subtle.sign(
      'HMAC',
      secretKey,
      encoder.encode(botToken)
    )

    const hmacKey = await crypto.subtle.importKey(
      'raw',
      secretBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )

    const signatureBytes = await crypto.subtle.sign(
      'HMAC',
      hmacKey,
      encoder.encode(dataCheckString)
    )

    const expectedHash = Array.from(new Uint8Array(signatureBytes))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    // Constant-time comparison to prevent timing attacks
    if (!timingSafeEqual(expectedHash, hash)) {
      return { valid: false, reason: 'invalid_signature' }
    }

    // Check auth_date freshness
    const authDate = Number(params.get('auth_date'))
    if (!authDate || isNaN(authDate)) {
      return { valid: false, reason: 'missing_auth_date' }
    }

    if (Date.now() - authDate * 1000 > maxAgeMs) {
      return { valid: false, reason: 'expired' }
    }

    // Parse user
    const userRaw = params.get('user')
    if (!userRaw) return { valid: false, reason: 'no_user' }

    const user: TelegramUser = JSON.parse(decodeURIComponent(userRaw))
    if (!user?.id) return { valid: false, reason: 'no_user_id' }

    return { valid: true, userId: user.id, user }

  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown_error'
    return { valid: false, reason }
  }
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

/**
 * Detects if a userId is a synthetic (non-Telegram) ID.
 * Synthetic IDs are negative integers created for username+PIN users.
 */
export function isSyntheticUser(userId: number): boolean {
  return userId < 0
}