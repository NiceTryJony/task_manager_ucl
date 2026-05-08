// 'use client'

// import { useEffect, useRef, useState } from 'react'
// import { useTelegram } from '@/hooks/useTelegram'
// import { useTaskStore } from '@/lib/store'
// import { supabase } from '@/lib/supabase'
// import { ListCard } from '@/components/ListCard'
// import { CreateListSheet } from '@/components/CreateListSheet'
// import { ListDetailView } from '@/components/ListDetailView'
// import { UsernameModal } from '@/components/UsernameModal'
// import { SkeletonList } from '@/components/ui/Skeleton'
// import { Plus, Sparkles } from 'lucide-react'
// import { gsap } from 'gsap'
// import type { TaskList } from '@/types'
// import { Toaster } from 'sonner'

// export default function HomePage() {
//   const { user, isReady, haptic, needsIdentify, setIdentity } = useTelegram()
//   const { lists, setLists, setUserId, activeListId, setActiveList } = useTaskStore()
//   const [loading,    setLoading]    = useState(true)
//   const [showCreate, setShowCreate] = useState(false)
//   const [uid,        setUid]        = useState<number>(0)
//   const headerRef = useRef<HTMLDivElement>(null)
//   const listRef   = useRef<HTMLDivElement>(null)

//   // Don't init until user is identified (not needsIdentify)
//   useEffect(() => {
//     if (!isReady || needsIdentify) return
//     const resolvedUid = user?.id ?? 0
//     setUid(resolvedUid)
//     setUserId(resolvedUid)
//     init(resolvedUid)
//   }, [isReady, needsIdentify, user?.id])

//   async function init(resolvedUid: number) {
//     const initData = window?.Telegram?.WebApp?.initData ?? ''
//     await fetch('/api/auth', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ initData }),
//     })

//     const res  = await fetch(`/api/lists?userId=${resolvedUid}`)
//     const data = await res.json()
//     setLists(data.lists ?? [])
//     setLoading(false)

//     requestAnimationFrame(() => {
//       if (headerRef.current) {
//         gsap.fromTo(headerRef.current,
//           { y: -20, opacity: 0 },
//           { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out' }
//         )
//       }
//       if (listRef.current) {
//         const cards = listRef.current.querySelectorAll('.list-card')
//         gsap.fromTo(cards,
//           { y: 24, opacity: 0 },
//           { y: 0, opacity: 1, duration: 0.4, ease: 'power3.out', stagger: 0.07, delay: 0.1 }
//         )
//       }
//     })
//   }

//   // Realtime: refresh list counts when tasks change
//   useEffect(() => {
//     if (!uid) return
//     const channel = supabase
//       .channel('lists-realtime')
//       .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'tasks' }, () => {
//         fetch(`/api/lists?userId=${uid}`)
//           .then(r => r.json())
//           .then(d => setLists(d.lists ?? []))
//       })
//       .subscribe()
//     return () => { supabase.removeChannel(channel) }
//   }, [uid])

//   function handleListCreated(list: TaskList) {
//     setLists([list, ...lists])
//     setShowCreate(false)
//     haptic.success()
//     setActiveList(list.id)
//   }

//   // Called after UsernameModal succeeds
//   function handleIdentified(userId: number, username: string) {
//     setIdentity(userId, username)
//     setUid(userId)
//     setUserId(userId)
//     init(userId)
//   }

//   const totalTasks = lists.reduce((s, l) => s + (l.task_count ?? 0), 0)
//   const doneTasks  = lists.reduce((s, l) => s + (l.done_count ?? 0), 0)

//   if (activeListId) {
//     return (
//       <>
//         <ListDetailView onBack={() => setActiveList(null)} />
//         <Toaster position="top-center" theme="dark" />
//       </>
//     )
//   }

//   return (
//     <div className="page-container">
//       <Toaster position="top-center" theme="dark" />

//       {/* Username modal — shown only in browser when no identity stored */}
//       {isReady && needsIdentify && (
//         <UsernameModal onIdentified={handleIdentified} />
//       )}

//       <div ref={headerRef} className="px-4 pt-4 pb-3 flex-shrink-0">
//         <div className="flex items-start justify-between">
//           <div>
//             <h1 className="text-2xl font-bold tracking-tight">
//               Hey, {user?.first_name ?? 'there'} 👋
//             </h1>
//             {!loading && totalTasks > 0 && (
//               <p className="text-text-secondary text-sm mt-0.5">
//                 {doneTasks}/{totalTasks} tasks completed
//               </p>
//             )}
//           </div>
//           <button
//             onClick={() => { setShowCreate(true); haptic.light() }}
//             className="btn-primary flex items-center gap-1.5 text-sm"
//           >
//             <Plus size={16} strokeWidth={2.5} />
//             New list
//           </button>
//         </div>

//         {totalTasks > 0 && (
//           <div className="mt-3 h-1.5 bg-bg-card rounded-full overflow-hidden">
//             <div
//               className="h-full bg-gradient-to-r from-accent to-pink rounded-full transition-all duration-700"
//               style={{ width: `${Math.round((doneTasks / totalTasks) * 100)}%` }}
//             />
//           </div>
//         )}
//       </div>

//       <div className="flex-1 scrollable px-4 pb-4">
//         {loading ? (
//           <SkeletonList />
//         ) : lists.length === 0 ? (
//           <EmptyState onCreate={() => setShowCreate(true)} />
//         ) : (
//           <div ref={listRef} className="space-y-3">
//             {lists.map(list => (
//               <div key={list.id} className="list-card">
//                 <ListCard
//                   list={list}
//                   userId={uid}
//                   onClick={() => { setActiveList(list.id); haptic.light() }}
//                   onEdited={updated => setLists(lists.map(l => l.id === updated.id ? updated : l))}
//                   onDeleted={id => setLists(lists.filter(l => l.id !== id))}
//                 />
//               </div>
//             ))}
//           </div>
//         )}
//       </div>

//       {showCreate && (
//         <CreateListSheet
//           userId={uid}
//           onClose={() => setShowCreate(false)}
//           onCreated={handleListCreated}
//         />
//       )}
//     </div>
//   )
// }

// function EmptyState({ onCreate }: { onCreate: () => void }) {
//   return (
//     <div className="flex flex-col items-center justify-center h-64 text-center px-6">
//       <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4 animate-float">
//         <Sparkles size={28} className="text-accent" />
//       </div>
//       <h2 className="text-lg font-semibold mb-1">No lists yet</h2>
//       <p className="text-text-secondary text-sm mb-6">
//         Create your first task list to get started
//       </p>
//       <button onClick={onCreate} className="btn-primary">
//         Create a list
//       </button>
//     </div>
//   )
// }










'use client'

import { useEffect, useRef, useState } from 'react'
import { useTelegram } from '@/hooks/useTelegram'
import { useTaskStore } from '@/lib/store'
import { supabase } from '@/lib/supabase'
import { ListCard } from '@/components/ListCard'
import { CreateListSheet } from '@/components/CreateListSheet'
import { ListDetailView } from '@/components/ListDetailView'
import { UsernameModal } from '@/components/UsernameModal'
import { SettingsSheet } from '@/components/SettingsSheet'
import { SkeletonList } from '@/components/ui/Skeleton'
import { Plus, Sparkles, Settings } from 'lucide-react'
import { gsap } from 'gsap'
import type { TaskList } from '@/types'
import { Toaster } from 'sonner'
import { ShareSheet } from '@/components/ShareSheet'

export default function HomePage() {
  const { user, isReady, haptic, needsIdentify, setIdentity} = useTelegram()
  const { lists, setLists, setUserId, activeListId, setActiveList } = useTaskStore()

  const [loading,       setLoading]       = useState(true)
  const [showCreate,    setShowCreate]     = useState(false)
  const [showSettings,  setShowSettings]  = useState(false)
  const [uid,           setUid]           = useState<number>(0)
  const [displayName,   setDisplayName]   = useState('')
  const [currentUn,     setCurrentUn]     = useState('')

  const headerRef = useRef<HTMLDivElement>(null)
  const listRef   = useRef<HTMLDivElement>(null)
  const [shareList, setShareList] = useState<TaskList | null>(null)

  useEffect(() => {
    if (!isReady || needsIdentify) return
    const resolvedUid = user?.id ?? 0
    setUid(resolvedUid)
    setUserId(resolvedUid)
    setDisplayName(user?.first_name ?? '')
    setCurrentUn(user?.username ?? '')
    init(resolvedUid)
  }, [isReady, needsIdentify, user?.id])

  async function init(resolvedUid: number) {
    const initData = window?.Telegram?.WebApp?.initData ?? ''
    await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData }),
    })

    const res  = await fetch(`/api/lists?userId=${resolvedUid}`)
    const data = await res.json()
    setLists(data.lists ?? [])
    setLoading(false)

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

  useEffect(() => {
    if (!uid) return
    const channel = supabase
      .channel('lists-realtime')
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'tasks' }, () => {
        fetch(`/api/lists?userId=${uid}`)
          .then(r => r.json())
          .then(d => setLists(d.lists ?? []))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [uid])

  function handleListCreated(list: TaskList) {
    setLists([list, ...lists])
    setShowCreate(false)
    haptic.success()
    setActiveList(list.id)
  }

  // function handleIdentified(userId: number, username: string, firstName: string) {
  //   setIdentity(userId, username, firstName)
  //   setUid(userId)
  //   setUserId(userId)
  //   setDisplayName(firstName)
  //   setCurrentUn(username)
  //   init(userId)
  // }

  // handleIdentified — убери четвёртый аргумент в SettingsSheet (isTgEnv)
  function handleIdentified(userId: number, username: string, firstName: string) {
    setIdentity(userId, username, firstName)
    setUid(userId)
    setUserId(userId)
    setDisplayName(firstName)
    setCurrentUn(username)
    init(userId)
  }

  function handleProfileUpdated(firstName: string) {
    setDisplayName(firstName)
    setIdentity(uid, currentUn, firstName)
  }

  const totalTasks = lists.reduce((s, l) => s + (l.task_count ?? 0), 0)
  const doneTasks  = lists.reduce((s, l) => s + (l.done_count ?? 0), 0)

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

      {isReady && needsIdentify && (
        <UsernameModal onIdentified={handleIdentified} />
      )}

      {showSettings && (
        <SettingsSheet
          userId={uid}
          firstName={displayName}
          username={currentUn}
          // isTgEnv={isTelegramEnv}
          onClose={() => setShowSettings(false)}
          onUpdated={handleProfileUpdated}
        />
      )}

      <div ref={headerRef} className="px-4 pt-4 pb-3 flex-shrink-0">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Hey, {displayName || user?.first_name || 'there'} 👋
            </h1>
            {!loading && totalTasks > 0 && (
              <p className="text-text-secondary text-sm mt-0.5">
                {doneTasks}/{totalTasks} tasks completed
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowSettings(true); haptic.light() }}
              className="btn-ghost p-2"
              aria-label="Settings"
            >
              <Settings size={18} />
            </button>
            <button
              onClick={() => { setShowCreate(true); haptic.light() }}
              className="btn-primary flex items-center gap-1.5 text-sm"
            >
              <Plus size={16} strokeWidth={2.5} />
              New list
            </button>
          </div>
        </div>

        {totalTasks > 0 && (
          <div className="mt-3 h-1.5 bg-bg-card rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-accent to-pink rounded-full transition-all duration-700"
              style={{ width: `${Math.round((doneTasks / totalTasks) * 100)}%` }}
            />
          </div>
        )}
      </div>

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
                  userId={uid}
                  onClick={() => { setActiveList(list.id); haptic.light() }}
                  onEdited={updated => setLists(lists.map(l => l.id === updated.id ? updated : l))}
                  onDeleted={id => setLists(lists.filter(l => l.id !== id))}
                  onShare={(list) => { setShareList(list); haptic.light() }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      

      {showCreate && (
        <CreateListSheet
          userId={uid}
          onClose={() => setShowCreate(false)}
          onCreated={handleListCreated}
        />
      )}

      {shareList && (
        <ShareSheet
          listId={shareList.id}
          listTitle={shareList.title}
          userId={uid}
          onClose={() => setShareList(null)}
        />
      )}
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4 animate-float">
        <Sparkles size={28} className="text-accent" />
      </div>
      <h2 className="text-lg font-semibold mb-1">No lists yet</h2>
      <p className="text-text-secondary text-sm mb-6">Create your first task list to get started</p>
      <button onClick={onCreate} className="btn-primary">Create a list</button>
    </div>
  )
}