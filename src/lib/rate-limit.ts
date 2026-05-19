/**
 * In-memory rate limiter.
 *
 * Suitable for single-instance Vercel deployments.
 * For multi-region or high-traffic — replace with Upstash Redis:
 *   https://github.com/upstash/ratelimit
 *
 * Automatically purges stale entries every 5 minutes
 * to prevent memory leaks on long-running instances.
 */

interface RateLimitEntry {
  count:   number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Purge expired entries periodically
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key)
    }
  }, 5 * 60 * 1000)
}

/**
 * Returns true if the request is allowed, false if rate-limited.
 *
 * @param key       - Unique identifier (e.g. IP address or userId)
 * @param limit     - Max requests per window
 * @param windowMs  - Window size in milliseconds
 */
export function rateLimit(
  key:      string,
  limit     = 60,
  windowMs  = 60_000
): boolean {
  const now   = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (entry.count >= limit) return false

  entry.count++
  return true
}

/**
 * Returns remaining requests and reset time for debugging / headers.
 */
export function getRateLimitInfo(
  key:     string,
  limit    = 60,
  windowMs = 60_000
): { remaining: number; resetAt: number } {
  const now   = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    return { remaining: limit, resetAt: now + windowMs }
  }

  return {
    remaining: Math.max(0, limit - entry.count),
    resetAt:   entry.resetAt,
  }
}