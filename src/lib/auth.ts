import { NextRequest } from 'next/server'

export function getUserId(req: NextRequest): number | null {
  const id = req.headers.get('x-user-id')
  if (!id) return null
  const n = Number(id)
  return Number.isNaN(n) ? null : n
}