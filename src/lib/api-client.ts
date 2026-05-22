/**
 * Typed API client for TaskFlow.
 *
 * Automatically attaches `x-telegram-init-data` header to every request
 * so the middleware can verify the caller.
 *
 * Usage — drop-in replacement for fetch():
 *
 *   // Before:
 *   const res = await fetch('/api/tasks?listId=...')
 *
 *   // After:
 *   const res = await apiFetch('/api/tasks?listId=...')
 *
 * The function reads initData once from Telegram.WebApp and caches it
 * for the session lifetime.
 */

let _cachedInitData: string | null = null

function getInitData(): string {
  if (_cachedInitData !== null) return _cachedInitData

  try {
    const initData = window?.Telegram?.WebApp?.initData ?? ''
    _cachedInitData = initData
    return initData
  } catch {
    _cachedInitData = ''
    return ''
  }
}

let _cachedUserId: string | undefined

export function invalidateUserCache() {
  _cachedUserId = undefined!
}

function getStoredUserId(): string {
  if (_cachedUserId !== undefined) return _cachedUserId
  let value: string   // ← локальная, всегда string
  try {
    value = localStorage.getItem('taskflow_user_id') ?? ''
  } catch {
    value = ''
  }
  _cachedUserId = value   // присваиваем после — TS видит string
  return value
}

/**
 * Drop-in replacement for fetch() that adds Telegram auth headers.
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const initData = getInitData()
  const headers = new Headers(init?.headers)

  if (initData) headers.set('x-telegram-init-data', initData)

  if (!headers.has('x-user-id')) {
    const storedId = getStoredUserId()
    if (storedId) headers.set('x-user-id', storedId)
  }

  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  return fetch(input, { ...init, headers })
}

/**
 * Convenience wrappers with typed responses.
 * Use these in components and hooks.
 */
export const api = {
  get<T = unknown>(url: string): Promise<T> {
    return apiFetch(url).then(res => {
      if (!res.ok) throw new ApiError(res.status, url)
      return res.json() as Promise<T>
    })
  },

  post<T = unknown>(url: string, body: unknown): Promise<T> {
    return apiFetch(url, {
      method: 'POST',
      body:   JSON.stringify(body),
    }).then(res => {
      if (!res.ok) throw new ApiError(res.status, url)
      return res.json() as Promise<T>
    })
  },

  patch<T = unknown>(url: string, body: unknown): Promise<T> {
    return apiFetch(url, {
      method: 'PATCH',
      body:   JSON.stringify(body),
    }).then(res => {
      if (!res.ok) throw new ApiError(res.status, url)
      return res.json() as Promise<T>
    })
  },

  delete<T = unknown>(url: string): Promise<T> {
    return apiFetch(url, { method: 'DELETE' }).then(res => {
      if (!res.ok) throw new ApiError(res.status, url)
      return res.json() as Promise<T>
    })
  },
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly url:    string
  ) {
    super(`API ${status} on ${url}`)
    this.name = 'ApiError'
  }

  get isUnauthorized() { return this.status === 401 }
  get isNotFound()     { return this.status === 404 }
  get isRateLimited()  { return this.status === 429 }
}