'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTelegram } from '@/hooks/useTelegram'
import { useTaskStore } from '@/lib/store'
import { ListCard } from '@/components/ListCard'
import { CreateListSheet } from '@/components/CreateListSheet'
import { ListDetailView } from '@/components/ListDetailView'
import { UsernameModal } from '@/components/UsernameModal'
import { SettingsSheet } from '@/components/SettingsSheet'
import { ShareSheet } from '@/components/ShareSheet'
import { GlobalSearchSheet } from '@/components/GlobalSearchSheet'
import { SkeletonList } from '@/components/ui/Skeleton'
import { Plus, Search, Sparkles, Settings, GripVertical } from 'lucide-react'
import type { TaskList } from '@/types'
import { Toaster } from 'sonner'
import { SaveBanner } from '@/components/ui/SaveBanner'
import { useI18n } from '@/lib/i18n-context'
import { apiFetch, invalidateUserCache } from '@/lib/api-client'
import {
  DndContext, closestCenter, PointerSensor,
  TouchSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// ── SortableListCard ──────────────────────────────────────────
// Drag handle отдельно от карточки — не конфликтует с кнопками меню

function SortableListCard(props: React.ComponentProps<typeof ListCard>) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.list.id })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform:  CSS.Transform.toString(transform),
        transition: transition ?? 'transform 200ms ease',
        opacity:    isDragging ? 0.45 : 1,
        zIndex:     isDragging ? 50 : undefined,
        position:   'relative',
      }}
    >
      {/* Drag handle — только он активирует drag, не вся карточка */}
      <div
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="absolute left-0 top-0 bottom-0 z-10 flex items-center pl-1 pr-2 cursor-grab active:cursor-grabbing touch-none select-none"
        style={{ width: 28 }}
        onClick={e => e.stopPropagation()}
      >
        <GripVertical
          size={14}
          style={{
            color: isDragging ? 'var(--c-accent)' : 'rgba(255,255,255,0.18)',
            transition: 'color 150ms ease',
          }}
        />
      </div>

      {/* Карточка со смещением чтобы не перекрывать handle */}
      <div style={{ paddingLeft: 20 }}>
        <ListCard {...props} />
      </div>
    </div>
  )
}

// ── HomePage ──────────────────────────────────────────────────

export default function HomePage() {
  const { user, isReady, haptic, needsIdentify, setIdentity } = useTelegram()
  const { lists, setLists, setUserId, activeListId, setActiveList, setPendingTaskId } = useTaskStore()
  const { t } = useI18n()

  const [loading,      setLoading]      = useState(true)
  const [showCreate,   setShowCreate]   = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showSearch,   setShowSearch]   = useState(false)
  const [shareList,    setShareList]    = useState<TaskList | null>(null)
  const [uid,          setUid]          = useState<number>(0)
  const [displayName,  setDisplayName]  = useState('')
  const [currentUn,    setCurrentUn]    = useState('')

  const startParamHandled = useRef(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 8 } }),
  )

  // ── Восстановление сохранённого порядка ──────────────────────
  function applyOrder(freshLists: TaskList[]): TaskList[] {
    try {
      const savedOrder = localStorage.getItem('taskflow_lists_order')
      if (!savedOrder) return freshLists
      const ids: string[] = JSON.parse(savedOrder)
      return [
        ...ids.map(id => freshLists.find(l => l.id === id)).filter(Boolean),
        ...freshLists.filter(l => !ids.includes(l.id)),
      ] as TaskList[]
    } catch {
      return freshLists
    }
  }

  // ── init ──────────────────────────────────────────────────────
  const init = useCallback(async (resolvedUid: number) => {
    // Мгновенно показываем кеш
    try {
      const cached = localStorage.getItem('taskflow_lists_cache')
      if (cached) {
        setLists(applyOrder(JSON.parse(cached)))
        setLoading(false)
      }
    } catch {}

    try {
      const [, listsRes] = await Promise.all([
        apiFetch('/api/auth', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            initData: window?.Telegram?.WebApp?.initData ?? '',
          }),
        }),
        apiFetch(`/api/lists?userId=${resolvedUid}`),
      ])

      const data = await listsRes.json()
      const freshLists: TaskList[] = data.lists ?? []
      const ordered = applyOrder(freshLists)

      setLists(ordered)
      setLoading(false)   // ← всегда вызывается, баг исправлен

      // Сохраняем свежие данные в кеш (без учёта порядка — порядок отдельно)
      try {
        localStorage.setItem('taskflow_lists_cache', JSON.stringify(freshLists))
      } catch {}

    } catch (err) {
      console.error('[init] failed:', err)
      setLoading(false)
    }
  }, [setLists])

  // ── DnD reorder ───────────────────────────────────────────────
  const handleListDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = lists.findIndex(l => l.id === active.id)
    const newIndex = lists.findIndex(l => l.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(lists, oldIndex, newIndex)
    setLists(reordered)
    haptic.medium()

    try {
      localStorage.setItem(
        'taskflow_lists_order',
        JSON.stringify(reordered.map(l => l.id))
      )
    } catch {}
  }, [lists, setLists, haptic])

  // ── Effects ───────────────────────────────────────────────────

  useEffect(() => {
    if (!isReady || needsIdentify) return
    const resolvedUid = user?.id ?? 0
    setUid(resolvedUid)
    setUserId(resolvedUid)
    setDisplayName(user?.first_name ?? '')
    setCurrentUn(user?.username ?? '')
    void init(resolvedUid)
  }, [isReady, needsIdentify, user?.id])

  useEffect(() => {
    if (loading || !lists.length || startParamHandled.current) return
    const startParam = window?.Telegram?.WebApp?.initDataUnsafe?.start_param
    if (!startParam?.startsWith('list_')) return
    const listId = startParam.replace('list_', '')
    const target = lists.find(l => l.id === listId)
    if (target) {
      startParamHandled.current = true
      setActiveList(listId)
      haptic.light()
    }
  }, [loading, lists, setActiveList, haptic])

  // ── Handlers ──────────────────────────────────────────────────

  const handleListCreated = useCallback((list: TaskList) => {
    setLists([list, ...useTaskStore.getState().lists])
    setShowCreate(false)
    haptic.success()
    setActiveList(list.id)
  }, [haptic, setLists, setActiveList])

  const handleIdentified = useCallback((
    userId: number,
    username: string,
    firstName: string,
  ) => {
    invalidateUserCache()
    setIdentity(userId, username, firstName)
    setUid(userId)
    setUserId(userId)
    setDisplayName(firstName)
    setCurrentUn(username)
    startParamHandled.current = false
    void init(userId)
  }, [setIdentity, setUserId, init])

  const handleProfileUpdated = useCallback((firstName: string) => {
    setDisplayName(firstName)
    setIdentity(
      useTaskStore.getState().userId ?? 0,
      currentUn,
      firstName,
    )
  }, [setIdentity, currentUn])

  const handleSelectTask = useCallback((listId: string, taskId: string) => {
    setPendingTaskId(taskId)
    setActiveList(listId)
  }, [setPendingTaskId, setActiveList])

  // ── Derived ───────────────────────────────────────────────────

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
      <SaveBanner />
      <Toaster position="top-center" theme="dark" />

      {isReady && needsIdentify && (
        <UsernameModal onIdentified={handleIdentified} />
      )}

      {showSettings && (
        <SettingsSheet
          userId={uid}
          firstName={displayName}
          username={currentUn}
          onClose={() => setShowSettings(false)}
          onUpdated={handleProfileUpdated}
        />
      )}

      {showSearch && (
        <GlobalSearchSheet
          userId={uid}
          activeListId={null}
          onClose={() => setShowSearch(false)}
          onSelectTask={handleSelectTask}
        />
      )}

      <div className="px-4 pt-4 pb-3 flex-shrink-0 animate-fade-up">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {t('greeting')}, {displayName || user?.first_name || 'there'} 👋
            </h1>
            {!loading && totalTasks > 0 && (
              <p className="text-text-secondary text-sm mt-0.5">
                {doneTasks}/{totalTasks} {t('tasksCompleted')}
              </p>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => { setShowSearch(true); haptic.light() }}
              className="btn-ghost p-2"
              aria-label={t('searchPlaceholderGlobal')}
            >
              <Search size={18} />
            </button>
            <button
              onClick={() => { setShowSettings(true); haptic.light() }}
              className="btn-ghost p-2"
              aria-label={t('settings')}
            >
              <Settings size={18} />
            </button>
            <button
              onClick={() => { setShowCreate(true); haptic.light() }}
              className="btn-primary flex items-center gap-1.5 text-sm"
            >
              <Plus size={16} strokeWidth={2.5} />
              {t('newList')}
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
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleListDragEnd}
          >
            <SortableContext
              items={lists.map(l => l.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3 stagger">
                {lists.map(list => (
                  <SortableListCard
                    key={list.id}
                    list={list}
                    userId={uid}
                    onClick={() => { setActiveList(list.id); haptic.light() }}
                    onEdited={updated =>
                      setLists(useTaskStore.getState().lists.map(l =>
                        l.id === updated.id ? updated : l
                      ))
                    }
                    onDeleted={id =>
                      setLists(useTaskStore.getState().lists.filter(l => l.id !== id))
                    }
                    onShare={l => { setShareList(l); haptic.light() }}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
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
  const { t } = useI18n()
  return (
    <div className="flex flex-col items-center justify-center h-64 text-center px-6">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
        style={{
          background: 'rgba(129,115,245,0.10)',
          border:     '0.5px solid rgba(129,115,245,0.18)',
          boxShadow:  'inset 0 1px 0 rgba(255,255,255,0.07)',
        }}
      >
        <Sparkles size={28} className="text-accent" />
      </div>
      <h2 className="text-lg font-semibold mb-1">{t('noLists')}</h2>
      <p className="text-text-secondary text-sm mb-6">{t('noListsDesc')}</p>
      <button onClick={onCreate} className="btn-primary">{t('createList')}</button>
    </div>
  )
}