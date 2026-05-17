'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { Loader2, Search, X } from 'lucide-react'
import { PRIORITY_CONFIG, STATUS_CONFIG, cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n-context'
import type { Priority, TaskStatus } from '@/types'

// ── Types ──────────────────────────────────────────────────────

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
  /** Pass non-null to show the "Current List" tab */
  activeListId: string | null
  onClose:      () => void
  /** Called when user picks a result — navigate to list and open task */
  onSelectTask: (listId: string, taskId: string) => void
}

type Tab = 'all' | 'current'

// ── Highlight ──────────────────────────────────────────────────
// Wraps the matched substring in a styled <mark> inline.

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>
  const lower = text.toLowerCase()
  const idx   = lower.indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-accent/25 text-accent rounded-sm not-italic font-semibold">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  )
}

// ── ResultCard ─────────────────────────────────────────────────

function ResultCard({
  result,
  query,
  onClick,
}: {
  result:  SearchResult
  query:   string
  onClick: () => void
}) {
  const { t } = useI18n()
  const priority = PRIORITY_CONFIG[result.task.priority]
  const status   = STATUS_CONFIG[result.task.status]

  return (
    <button
      onClick={onClick}
      className="w-full text-left card p-0 overflow-hidden hover:bg-bg-hover active:scale-[0.983] transition-all duration-150"
    >
      <div className="flex gap-0">
        {/* Color accent stripe */}
        <div
          className="w-1 flex-shrink-0 self-stretch"
          style={{ background: result.list.color }}
        />

        <div className="flex-1 min-w-0 px-3.5 py-3 space-y-1.5">
          {/* List badge */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px]">{result.list.emoji}</span>
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full leading-none"
              style={{
                background: `${result.list.color}22`,
                color:      result.list.color,
              }}
            >
              {result.list.title}
            </span>
          </div>

          {/* Task title — highlight match */}
          <p className="text-sm font-medium text-text-primary leading-snug">
            <Highlight text={result.task.title} query={query} />
          </p>

          {/* Priority + Status chips */}
          <div className="flex items-center gap-1.5">
            <span className={cn('text-[11px] px-2 py-0.5 rounded-full font-medium', priority.color, priority.bg)}>
              {priority.label}
            </span>
            <span className={cn('text-[11px] px-2 py-0.5 rounded-full font-medium', status.color, status.bg)}>
              {status.label}
            </span>
          </div>

          {/* Snippet for description / subtask matches */}
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

// ── GlobalSearchSheet ──────────────────────────────────────────

export function GlobalSearchSheet({ userId, activeListId, onClose, onSelectTask }: Props) {
  const { t } = useI18n()

  const [tab,     setTab]     = useState<Tab>('all')
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [touched, setTouched] = useState(false)   // true once user has typed something

  const sheetRef    = useRef<HTMLDivElement>(null)
  const overlayRef  = useRef<HTMLDivElement>(null)
  const inputRef    = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const abortRef    = useRef<AbortController>()

  // ── Sheet animation ────────────────────────────────────────
  useEffect(() => {
    gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2 })
    gsap.fromTo(sheetRef.current,   { y: '100%' },  { y: 0, duration: 0.32, ease: 'power3.out' })
    // Focus after animation
    const t = setTimeout(() => inputRef.current?.focus(), 340)
    return () => clearTimeout(t)
  }, [])

  function close() {
    gsap.to(sheetRef.current,   { y: '100%', duration: 0.24, ease: 'power3.in' })
    gsap.to(overlayRef.current, { opacity: 0, duration: 0.2, onComplete: onClose })
  }

  // ── Search logic ───────────────────────────────────────────
  const doSearch = useCallback(async (q: string, currentTab: Tab) => {
    if (!q.trim()) { setResults([]); setLoading(false); return }

    abortRef.current?.abort()
    abortRef.current = new AbortController()

    setLoading(true)
    try {
      const listParam = currentTab === 'current' && activeListId
        ? `&listId=${encodeURIComponent(activeListId)}`
        : ''
      const res  = await fetch(
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
    // Let the close animation start before triggering navigation
    setTimeout(() => onSelectTask(result.list.id, result.task.id), 80)
  }

  // ── Render states ──────────────────────────────────────────
  const isEmpty      = touched && !loading && query.trim() && results.length === 0
  const hasResults   = !loading && results.length > 0
  const showIdleHint = !query.trim() && !touched
  const showCurrent  = activeListId !== null

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div ref={overlayRef} className="absolute inset-0 sheet-overlay" onClick={close} />

      <div
        ref={sheetRef}
        className="relative w-full h-[94dvh] bg-bg-surface rounded-t-3xl border-t border-bg-border z-10 flex flex-col"
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 flex-shrink-0">
          <div className="w-9 h-1 bg-bg-border rounded-full" />
        </div>

        {/* Search input row */}
        <div className="flex-shrink-0 flex items-center gap-2 px-4 pt-3 pb-2">
          <div className="relative flex-1">
            <Search
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-dim pointer-events-none"
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
            {/* Right indicator: spinner or clear button */}
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

          {/* Cancel button */}
          <button
            onClick={close}
            className="flex-shrink-0 text-sm text-accent font-medium px-1 py-2"
          >
            {t('cancel')}
          </button>
        </div>

        {/* Tabs — only if current list is known */}
        <div className="flex-shrink-0 flex gap-2 px-4 pb-3">
          <button
            onClick={() => handleTabChange('all')}
            className={cn(
              'px-4 py-1.5 rounded-xl text-sm font-medium transition-all',
              tab === 'all'
                ? 'bg-accent text-white'
                : 'bg-bg-card text-text-secondary border border-bg-border/60 hover:bg-bg-hover'
            )}
          >
            {t('searchAll')}
          </button>
          {showCurrent && (
            <button
              onClick={() => handleTabChange('current')}
              className={cn(
                'px-4 py-1.5 rounded-xl text-sm font-medium transition-all',
                tab === 'current'
                  ? 'bg-accent text-white'
                  : 'bg-bg-card text-text-secondary border border-bg-border/60 hover:bg-bg-hover'
              )}
            >
              {t('searchCurrent')}
            </button>
          )}
        </div>

        {/* Divider */}
        <div className="h-px bg-bg-border/60 flex-shrink-0" />

        {/* Results / states */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollable px-4 py-4">

          {/* Idle — waiting for input */}
          {showIdleHint && (
            <div className="flex flex-col items-center justify-center h-52 text-center select-none">
              <Search size={36} className="text-text-dim opacity-25 mb-3" />
              <p className="text-sm text-text-dim">{t('searchPlaceholderGlobal')}</p>
            </div>
          )}

          {/* Empty state */}
          {isEmpty && (
            <div className="flex flex-col items-center justify-center h-52 text-center animate-fade-up select-none">
              <p className="text-3xl mb-2">🔍</p>
              <p className="text-sm font-semibold text-text-primary">{t('searchNoResults')}</p>
              <p className="text-xs text-text-dim mt-1 font-mono">«{query}»</p>
            </div>
          )}

          {/* Results */}
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