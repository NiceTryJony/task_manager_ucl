import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getUserId } from '@/lib/auth'

// GET /api/search?q=...&userId=...&listId=... (listId optional)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q      = searchParams.get('q')?.trim()
  const userId   = getUserId(req)
  const listId = searchParams.get('listId') ?? null // optional filter

  if (!q || q.length < 1 || !userId) {
    return NextResponse.json({ results: [] })
  }

  const db = createServiceClient()

  // 1. Lists this user can access
  const { data: memberships } = await db
    .from('list_members')
    .select('list_id')
    .eq('user_id', userId)

  if (!memberships?.length) return NextResponse.json({ results: [] })

  let listIds = memberships.map(m => m.list_id)

  if (listId) {
    if (!listIds.includes(listId)) return NextResponse.json({ results: [] })
    listIds = [listId]
  }

  // 2. List metadata
  const { data: lists } = await db
    .from('task_lists')
    .select('id, title, emoji, color')
    .in('id', listIds)

  const listsMap = new Map((lists ?? []).map(l => [l.id, l]))

  // 3. Tasks matching title or description (parallel with subtask search)
  const [taskRes, subRes] = await Promise.all([
    db
      .from('tasks')
      .select('id, list_id, title, description, status, priority')
      .in('list_id', listIds)
      .eq('archived', false)
      .or(`title.ilike.%${q}%,description.ilike.%${q}%`)
      .order('created_at', { ascending: false })
      .limit(40),

    db
      .from('subtasks')
      .select('id, task_id, title')
      .ilike('title', `%${q}%`)
      .limit(25),
  ])

  const taskMatches = taskRes.data ?? []
  const subMatches  = subRes.data  ?? []

  // 4. Fetch parent tasks for subtask matches (not already in taskMatches)
  const existingIds  = new Set(taskMatches.map(t => t.id))
  const subTaskIds   = [...new Set(subMatches.map(s => s.task_id))].filter(
    id => !existingIds.has(id)
  )

  let subParentTasks: typeof taskMatches = []
  if (subTaskIds.length) {
    const { data } = await db
      .from('tasks')
      .select('id, list_id, title, description, status, priority')
      .in('id', subTaskIds)
      .in('list_id', listIds)
      .eq('archived', false)
    subParentTasks = data ?? []
  }

  // 5. Merge — task matches take priority over sub-parent matches
  const taskMap = new Map<string, (typeof taskMatches)[number]>()
  for (const t of [...taskMatches, ...subParentTasks]) {
    if (!taskMap.has(t.id)) taskMap.set(t.id, t)
  }

  // Index subtask titles by task_id
  const subByTask = new Map<string, string[]>()
  for (const s of subMatches) {
    if (!subByTask.has(s.task_id)) subByTask.set(s.task_id, [])
    subByTask.get(s.task_id)!.push(s.title)
  }

  const qLower  = q.toLowerCase()
  const ORDER   = { title: 0, description: 1, subtask: 2 } as const
  const results: {
    task:         { id: string; list_id: string; title: string; status: string; priority: string }
    list:         { id: string; title: string; emoji: string; color: string }
    matchType:    'title' | 'description' | 'subtask'
    matchSnippet: string | null
  }[] = []

  for (const task of taskMap.values()) {
    const list = listsMap.get(task.list_id)
    if (!list) continue

    const matchTitle = task.title.toLowerCase().includes(qLower)
    const matchDesc  = task.description?.toLowerCase().includes(qLower) ?? false
    const subTitles  = subByTask.get(task.id) ?? []

    let matchType: 'title' | 'description' | 'subtask'
    let matchSnippet: string | null = null

    if (matchTitle) {
      matchType = 'title'
    } else if (matchDesc && task.description) {
      matchType = 'description'
      const idx   = task.description.toLowerCase().indexOf(qLower)
      const start = Math.max(0, idx - 28)
      const end   = Math.min(task.description.length, idx + q.length + 28)
      matchSnippet =
        (start > 0 ? '…' : '') +
        task.description.slice(start, end) +
        (end < task.description.length ? '…' : '')
    } else if (subTitles.length) {
      matchType    = 'subtask'
      matchSnippet = subTitles[0]
    } else {
      continue
    }

    results.push({
      task: {
        id:       task.id,
        list_id:  task.list_id,
        title:    task.title,
        status:   task.status,
        priority: task.priority,
      },
      list: {
        id:    list.id,
        title: list.title,
        emoji: list.emoji,
        color: list.color,
      },
      matchType,
      matchSnippet,
    })
  }

  results.sort((a, b) => ORDER[a.matchType] - ORDER[b.matchType])

  return NextResponse.json({ results: results.slice(0, 30) })
}