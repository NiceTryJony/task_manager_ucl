'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { Loader2, Search, X } from 'lucide-react'
import { PRIORITY_CONFIG, STATUS_CONFIG, cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n-context'
import type { Priority, TaskStatus } from '@/types'
import { apiFetch } from '@/lib/api-client'

interface SearchResult {
  task: {
    id:       string
    list_id:  string
    title:    string
    status:   TaskStatus
    priority: Priority
  }
  list: {
    id:    string
    title: string
    emoji: string
    color: string
  }
  matchType:    'title' | 'description' | 'subtask'
  matchSnippet: string | null
}

interface Props {
  userId:       number
  activeListId: string | null
  onClose:      () => void
  onSelectTask: (listId: string, taskId: string) => void
}

type Tab = 'all' | 'current'

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>
  const lower = text.toLowerCase()
  const idx   = lower.indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark
        className="not-italic font-semibold rounded-sm"
        style={{ background: 'rgba(129,115,245,0.25)', color: 'var(--c-accent)' }}
      >
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  )
}

function ResultCard({ result, query, onClick }: { result: SearchResult; query: string; onClick: () => void }) {
  const { t } = useI18n()
  const priority = PRIORITY_CONFIG[result.task.priority]
  const status   = STATUS_CONFIG[result.task.status]

  return (
    <button
      onClick={onClick}
      className="w-full text-left overflow-hidden active:scale-[0.983] transition-all duration-150"
      style={{
        borderRadius: 18,
        background:   'rgba(255,255,255,0.04)',
        border:       '0.5px solid rgba(255,255,255,0.08)',
        boxShadow:    'inset 0 1px 0 rgba(255,255,255,0.05)',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)' }}
    >
      <div className="flex gap-0">
        {/* Color accent stripe */}
        <div
          className="w-1 flex-shrink-0 self-stretch"
          style={{ background: result.list.color, borderRadius: '18px 0 0 18px' }}
        />

        <div className="flex-1 min-w-0 px-3.5 py-3 space-y-1.5">
          {/* List badge */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px]">{result.list.emoji}</span>
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full leading-none"
              style={{
                background: `${result.list.color}1E`,
                color:      result.list.color,
              }}
            >
              {result.list.title}
            </span>
          </div>

          <p className="text-sm font-medium text-text-primary leading-snug">
            <Highlight text={result.task.title} query={query} />
          </p>

          <div className="flex items-center gap-1.5">
            <span className={cn('text-[11px] px-2 py-0.5 rounded-full font-medium', priority.color, priority.bg)}>
              {priority.label}
            </span>
            <span className={cn('text-[11px] px-2 py-0.5 rounded-full font-medium', status.color, status.bg)}>
              {status.label}
            </span>
          </div>

          {result.matchSnippet && result.matchType !== 'title' && (
            <div className="flex items-baseline gap-1.5 pt-0.5">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-text-dim flex-shrink-0">
                {result.matchType === 'description' ? t('searchMatchDesc') : t('searchMatchSubtask')}
              </span>
              <p className="text-[11px] text-text-secondary italic truncate flex-1">
                <Highlight text={result.matchSnippet} query={query} />
              </p>
            </div>
          )}
        </div>
      </div>
    </button>
  )
}

export function GlobalSearchSheet({ userId, activeListId, onClose, onSelectTask }: Props) {
  const { t } = useI18n()

  const [tab,     setTab]     = useState<Tab>('all')
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [touched, setTouched] = useState(false)

  const sheetRef    = useRef<HTMLDivElement>(null)
  const overlayRef  = useRef<HTMLDivElement>(null)
  const inputRef    = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const abortRef    = useRef<AbortController>()

  useEffect(() => {
    gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2 })
    gsap.fromTo(sheetRef.current,   { y: '100%' },  { y: 0, duration: 0.32, ease: 'power3.out' })
    const t = setTimeout(() => inputRef.current?.focus(), 340)
    return () => clearTimeout(t)
  }, [])

  function close() {
    gsap.to(sheetRef.current,   { y: '100%', duration: 0.24, ease: 'power3.in' })
    gsap.to(overlayRef.current, { opacity: 0, duration: 0.2, onComplete: onClose })
  }

  const doSearch = useCallback(async (q: string, currentTab: Tab) => {
    if (!q.trim()) { setResults([]); setLoading(false); return }

    abortRef.current?.abort()
    abortRef.current = new AbortController()

    setLoading(true)
    try {
      const listParam = currentTab === 'current' && activeListId
        ? `&listId=${encodeURIComponent(activeListId)}`
        : ''
      const res  = await apiFetch(
        `/api/search?q=${encodeURIComponent(q)}&userId=${userId}${listParam}`,
        { signal: abortRef.current.signal }
      )
      const data = await res.json()
      setResults(data.results ?? [])
    } catch (e: any) {
      if (e.name !== 'AbortError') setResults([])
    }
    setLoading(false)
  }, [userId, activeListId])

  function handleQueryChange(value: string) {
    setQuery(value)
    setTouched(true)
    clearTimeout(debounceRef.current)
    if (!value.trim()) { setResults([]); return }
    debounceRef.current = setTimeout(() => doSearch(value, tab), 300)
  }

  function handleTabChange(next: Tab) {
    if (next === tab) return
    setTab(next)
    if (query.trim()) doSearch(query, next)
  }

  function handleClear() {
    setQuery('')
    setResults([])
    setTouched(false)
    inputRef.current?.focus()
  }

  function handleSelect(result: SearchResult) {
    close()
    setTimeout(() => onSelectTask(result.list.id, result.task.id), 80)
  }

  const isEmpty      = touched && !loading && query.trim() && results.length === 0
  const hasResults   = !loading && results.length > 0
  const showIdleHint = !query.trim() && !touched
  const showCurrent  = activeListId !== null

  const tabStyle = (active: boolean): React.CSSProperties => active
    ? { background: 'var(--c-accent)', color: '#fff', borderRadius: 12, border: 'none' }
    : {
        background:  'rgba(255,255,255,0.05)',
        border:      '0.5px solid rgba(255,255,255,0.09)',
        boxShadow:   'inset 0 1px 0 rgba(255,255,255,0.05)',
        color:       'var(--text-secondary)',
        borderRadius: 12,
      }

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div ref={overlayRef} className="absolute inset-0 sheet-overlay" onClick={close} />

      <div
        ref={sheetRef}
        className="relative w-full flex flex-col"
        style={{
          height:              '94dvh',
          // ── glassmorphism ──────────────────────────────
          background:          'var(--sheet-bg)',
          backdropFilter:      'var(--glass-blur)',
          WebkitBackdropFilter:'var(--glass-blur)',
          borderRadius:        '24px 24px 0 0',
          borderTop:           '0.5px solid var(--glass-border-top)',
          boxShadow:           'var(--glass-shadow)',
        }}
      >
        {/* Top-edge shimmer */}
        <div
          className="absolute top-0 left-12 right-12 h-px pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.14), transparent)' }}
        />

        {/* Handle */}
        <div className="flex justify-center pt-3 flex-shrink-0">
          <div className="w-9 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.12)' }} />
        </div>

        {/* Search input */}
        <div className="flex-shrink-0 flex items-center gap-2 px-4 pt-3 pb-2">
          <div className="relative flex-1">
            <Search
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--text-dim)' }}
            />
            <input
              ref={inputRef}
              value={query}
              onChange={e => handleQueryChange(e.target.value)}
              placeholder={t('searchPlaceholderGlobal')}
              className="input-field pl-10 pr-9 text-sm py-3 font-normal"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              type="search"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {loading ? (
                <Loader2 size={14} className="text-accent animate-spin" />
              ) : query ? (
                <button
                  onClick={handleClear}
                  className="text-text-dim hover:text-text-secondary transition-colors"
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>
          </div>

          <button onClick={close} className="flex-shrink-0 text-sm text-accent font-medium px-1 py-2">
            {t('cancel')}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex-shrink-0 flex gap-2 px-4 pb-3">
          <button
            onClick={() => handleTabChange('all')}
            className="px-4 py-1.5 text-sm font-medium transition-all"
            style={tabStyle(tab === 'all')}
          >
            {t('searchAll')}
          </button>
          {showCurrent && (
            <button
              onClick={() => handleTabChange('current')}
              className="px-4 py-1.5 text-sm font-medium transition-all"
              style={tabStyle(tab === 'current')}
            >
              {t('searchCurrent')}
            </button>
          )}
        </div>

        {/* Divider */}
        <div className="h-px flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }} />

        {/* Results */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollable px-4 py-4">

          {showIdleHint && (
            <div className="flex flex-col items-center justify-center h-52 text-center select-none">
              <Search size={36} className="text-text-dim opacity-25 mb-3" />
              <p className="text-sm text-text-dim">{t('searchPlaceholderGlobal')}</p>
            </div>
          )}

          {isEmpty && (
            <div className="flex flex-col items-center justify-center h-52 text-center animate-fade-up select-none">
              <p className="text-3xl mb-2">🔍</p>
              <p className="text-sm font-semibold text-text-primary">{t('searchNoResults')}</p>
              <p className="text-xs text-text-dim mt-1 font-mono">«{query}»</p>
            </div>
          )}

          {hasResults && (
            <div className="space-y-2 animate-fade-up">
              {results.map(result => (
                <ResultCard
                  key={`${result.task.id}-${result.matchType}`}
                  result={result}
                  query={query}
                  onClick={() => handleSelect(result)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}