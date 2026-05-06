'use client'

import { useEffect, useRef, useState } from 'react'
import { useTelegram } from '@/hooks/useTelegram'
import { useTaskStore } from '@/lib/store'
import { supabase } from '@/lib/supabase'
import { ListCard } from '@/components/ListCard'
import { CreateListSheet } from '@/components/CreateListSheet'
import { ListDetailView } from '@/components/ListDetailView'
import { SkeletonList } from '@/components/ui/Skeleton'
import { Plus, Sparkles } from 'lucide-react'
import { gsap } from 'gsap'
import type { TaskList } from '@/types'
import { Toaster } from 'sonner'

export default function HomePage() {
  const { user, isReady, haptic } = useTelegram()
  const { lists, setLists, setUserId, activeListId, setActiveList } = useTaskStore()
  const [loading, setLoading]   = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const headerRef = useRef<HTMLDivElement>(null)
  const listRef   = useRef<HTMLDivElement>(null)

  // Auth + fetch lists
useEffect(() => {
  if (!isReady) return
  setUserId(user?.id ?? 0)
  init()
}, [isReady, user])

  async function init() {
    // Validate Telegram session
    const initData = window?.Telegram?.WebApp?.initData ?? ''
    await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData }),
    })

    // Fetch lists
    const res = await fetch(`/api/lists?userId=${user?.id ?? 0}`)
    const data = await res.json()
    setLists(data.lists ?? [])
    setLoading(false)

    // Animate in
    requestAnimationFrame(() => {
      if (headerRef.current) {
        gsap.fromTo(headerRef.current,
          { y: -20, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out' }
        )
      }
      if (listRef.current) {
        const cards = listRef.current.querySelectorAll('.list-card')
        gsap.fromTo(cards,
          { y: 24, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.4, ease: 'power3.out', stagger: 0.07, delay: 0.1 }
        )
      }
    })
  }

  // Real-time: update list counts when tasks change
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('lists-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        fetch(`/api/lists?userId=${user.id}`)
          .then(r => r.json())
          .then(d => setLists(d.lists ?? []))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user])

  function handleListCreated(list: TaskList) {
    setLists([list, ...lists])
    setShowCreate(false)
    haptic.success()
    setActiveList(list.id)
  }

  const totalTasks = lists.reduce((s, l) => s + (l.task_count ?? 0), 0)
  const doneTasks  = lists.reduce((s, l) => s + (l.done_count ?? 0), 0)

  // If list is active, show detail view
  if (activeListId) {
    return (
      <>
        <ListDetailView onBack={() => setActiveList(null)} />
        <Toaster position="top-center" theme="dark" />
      </>
    )
  }

  return (
    <div className="page-container">
      <Toaster position="top-center" theme="dark" />

      {/* Header */}
      <div ref={headerRef} className="px-4 pt-4 pb-3 flex-shrink-0">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Hey, {user?.first_name ?? 'there'} 👋
            </h1>
            {!loading && totalTasks > 0 && (
              <p className="text-text-secondary text-sm mt-0.5">
                {doneTasks}/{totalTasks} tasks completed
              </p>
            )}
          </div>
          <button
            onClick={() => { setShowCreate(true); haptic.light() }}
            className="btn-primary flex items-center gap-1.5 text-sm"
          >
            <Plus size={16} strokeWidth={2.5} />
            New list
          </button>
        </div>

        {/* Progress bar */}
        {totalTasks > 0 && (
          <div className="mt-3 h-1.5 bg-bg-card rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-accent to-pink rounded-full transition-all duration-700"
              style={{ width: `${Math.round((doneTasks / totalTasks) * 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Lists */}
      <div className="flex-1 scrollable px-4 pb-4">
        {loading ? (
          <SkeletonList />
        ) : lists.length === 0 ? (
          <EmptyState onCreate={() => setShowCreate(true)} />
        ) : (
          <div ref={listRef} className="space-y-3">
            {lists.map(list => (
              <div key={list.id} className="list-card">
                <ListCard
                  list={list}
                  onClick={() => { setActiveList(list.id); haptic.light() }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create list bottom sheet */}
      {showCreate && (
        <CreateListSheet
          userId={user!.id}
          onClose={() => setShowCreate(false)}
          onCreated={handleListCreated}
        />
      )}
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
        <Sparkles size={28} className="text-accent" />
      </div>
      <h2 className="text-lg font-semibold mb-1">No lists yet</h2>
      <p className="text-text-secondary text-sm mb-6">
        Create your first task list to get started
      </p>
      <button onClick={onCreate} className="btn-primary">
        Create a list
      </button>
    </div>
  )
}
