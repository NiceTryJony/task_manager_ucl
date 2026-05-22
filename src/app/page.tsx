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
import { Plus, Search, Sparkles, Settings } from 'lucide-react'
import type { TaskList } from '@/types'
import { Toaster } from 'sonner'
import { SaveBanner } from '@/components/ui/SaveBanner'
import { useI18n } from '@/lib/i18n-context'
import { apiFetch, invalidateUserCache } from '@/lib/api-client'

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

  // Stable ref — startParam эффект срабатывает после lists загрузки
  const startParamHandled = useRef(false)

  // ── init — useCallback, стабильная ссылка ────────────────────
  // setLists / setUserId из Zustand стабильны по ссылке — их можно
  // не включать в deps, но eslint их требует. Реального пересоздания нет.
  const init = useCallback(async (resolvedUid: number) => {
    // Показываем кеш мгновенно, не ждём сеть
    try {
      const cached = localStorage.getItem('taskflow_lists_cache')
      if (cached) {
        setLists(JSON.parse(cached))
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

      setLists(freshLists)
      setLoading(false)

      try {
        localStorage.setItem('taskflow_lists_cache', JSON.stringify(freshLists))
      } catch {}
    } catch (err) {
      console.error('[init] failed:', err)
      setLoading(false)
    }
  }, [setLists])

  // ── Инициализация при готовности Telegram / PIN-auth ─────────
  useEffect(() => {
    if (!isReady || needsIdentify) return

    const resolvedUid = user?.id ?? 0
    setUid(resolvedUid)
    setUserId(resolvedUid)
    setDisplayName(user?.first_name ?? '')
    setCurrentUn(user?.username ?? '')
    void init(resolvedUid)
  }, [isReady, needsIdentify, user?.id]) // init стабилен — не вызовет лишних запусков

  // ── Deep-link: открыть список из start_param ─────────────────
  // Срабатывает один раз после загрузки списков
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
    startParamHandled.current = false  // сбросить — новый пользователь
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
          <div className="space-y-3 stagger">
            {lists.map(list => (
              <div key={list.id} className="list-card">
                <ListCard
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