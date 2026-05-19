'use client'

// src/components/ExportPanel.tsx

import { useState, useRef } from 'react'
import {
  FileText, Code2, LayoutGrid, Table2,
  Download, Copy, Share2, CheckCheck,
  Loader2, ChevronDown, ChevronUp, CheckCircle2, Calendar,
} from 'lucide-react'
import { cn, PRIORITY_CONFIG } from '@/lib/utils'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api-client'

// ── Types ──────────────────────────────────────────────────────
type ExportFormat = 'text' | 'markdown' | 'cards' | 'csv' | 'json'

interface SubTask { title: string; completed: boolean }
interface Task {
  id:          string
  title:       string
  status:      string
  priority:    string
  due_date?:   string
  due_at?:     string
  description?: string
  subtasks?:   SubTask[]
}
interface ExportData {
  list:        { title: string; id: string }
  tasks:       Task[]
  exported_at: string
}
interface CacheEntry { text: string | null; json: ExportData | null }

interface Props {
  listId:    string
  userId:    number
  listTitle: string
}

// ── Config ─────────────────────────────────────────────────────
const FORMATS: {
  key:       ExportFormat
  label:     string
  icon:      React.ReactNode
  desc:      string
  apiFormat: string
  ext:       string
  mime:      string
}[] = [
  { key: 'text',     label: '📄 Text',     icon: <FileText   size={12} />, desc: 'Plain text — paste anywhere',        apiFormat: 'text',     ext: 'txt',  mime: 'text/plain'         },
  { key: 'markdown', label: '✍️ Markdown', icon: <Code2      size={12} />, desc: 'For Notion, Obsidian, GitHub',       apiFormat: 'markdown', ext: 'md',   mime: 'text/markdown'      },
  { key: 'cards',    label: '🃏 Cards',    icon: <LayoutGrid size={12} />, desc: 'Visual preview grouped by status',   apiFormat: 'json',     ext: 'json', mime: 'application/json'   },
  { key: 'csv',      label: '📊 CSV',      icon: <Table2     size={12} />, desc: 'For Excel, Google Sheets',          apiFormat: 'csv',      ext: 'csv',  mime: 'text/csv'           },
  { key: 'json',     label: '{} JSON',     icon: <Code2      size={12} />, desc: 'Raw structured data for developers', apiFormat: 'json',     ext: 'json', mime: 'application/json'   },
]

const STATUS_ORDER = ['todo', 'in_progress', 'done'] as const
const STATUS_META: Record<string, { label: string; dot: string }> = {
  todo:        { label: '📋 To Do',       dot: 'bg-bg-border'  },
  in_progress: { label: '⚡ In Progress', dot: 'bg-accent/70'  },
  done:        { label: '✅ Done',        dot: 'bg-emerald/70' },
}

// ── ExportPanel ────────────────────────────────────────────────
export function ExportPanel({ listId, userId, listTitle }: Props) {
  const [isOpen,  setIsOpen]  = useState(false)
  const [format,  setFormat]  = useState<ExportFormat>('text')
  const [rawText, setRawText] = useState<string | null>(null)
  const [jsonData, setJsonData] = useState<ExportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied,  setCopied]  = useState(false)

  // Cache by API format: 'cards' and 'json' share the same JSON cache entry
  const cache = useRef<Map<string, CacheEntry>>(new Map())

  async function fetchFormat(fmt: ExportFormat) {
    const fmtCfg  = FORMATS.find(f => f.key === fmt)!
    const cacheKey = fmtCfg.apiFormat

    const cached = cache.current.get(cacheKey)
    if (cached) {
      setRawText(cached.text)
      setJsonData(cached.json)
      return
    }

    setLoading(true)
    setRawText(null)
    setJsonData(null)

    try {
      const res = await apiFetch(
        `/api/export?listId=${listId}&userId=${userId}&format=${fmtCfg.apiFormat}`
      )
      if (!res.ok) { toast.error('Export failed'); return }

      if (fmtCfg.apiFormat === 'json') {
        const json: ExportData = await res.json()
        const text = JSON.stringify(json, null, 2)
        setJsonData(json)
        setRawText(text)
        cache.current.set(cacheKey, { text, json })
      } else {
        const text = await res.text()
        setRawText(text)
        setJsonData(null)
        cache.current.set(cacheKey, { text, json: null })
      }
    } catch {
      toast.error('Network error')
    } finally {
      setLoading(false)
    }
  }

  async function handleToggle() {
    if (isOpen) { setIsOpen(false); return }
    setIsOpen(true)
    await fetchFormat(format)
  }

  async function handleFormatChange(fmt: ExportFormat) {
    if (fmt === format) return
    setFormat(fmt)
    await fetchFormat(fmt)
  }

  // ── Copy ────────────────────────────────────────────────────
  function getShareText(): string {
    if ((format === 'cards') && jsonData) {
      // Human-readable for share/copy in cards mode
      return jsonData.tasks
        .map(t => `${t.status === 'done' ? '✅' : '○'} ${t.title}`)
        .join('\n')
    }
    return rawText ?? ''
  }

  async function handleCopy() {
    const text = getShareText()
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success('Copied!')
      setTimeout(() => setCopied(false), 2500)
    } catch {
      toast.error('Copy failed — select manually')
    }
  }

  // ── Download ────────────────────────────────────────────────
  function handleDownload() {
    const content = rawText ?? ''
    if (!content) return
    const fmtCfg = FORMATS.find(f => f.key === format)!
    const blob   = new Blob([content], { type: fmtCfg.mime })
    const url    = URL.createObjectURL(blob)
    const a      = document.createElement('a')
    a.href       = url
    a.download   = `${listTitle}.${fmtCfg.ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success(`Downloaded ${listTitle}.${fmtCfg.ext}`)
  }

  // ── Native share ────────────────────────────────────────────
  async function handleShare() {
    const text = getShareText()
    if (!text) return

    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ title: listTitle, text })
      } catch (e: any) {
        if (e.name !== 'AbortError') toast.error('Share failed')
      }
    } else {
      // Graceful fallback
      await handleCopy()
      toast('Copied! (native share not supported here)', { icon: '📋' })
    }
  }

  const hasContent = !loading && rawText !== null
  const currentFmt = FORMATS.find(f => f.key === format)!

  return (
    <div className="space-y-2 pb-2">
      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-bg-border/60" />
        <span className="text-xs text-text-dim">export & share</span>
        <div className="flex-1 h-px bg-bg-border/60" />
      </div>

      {/* Toggle */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-bg-card border border-bg-border/60 text-sm hover:bg-bg-hover transition-colors"
      >
        <span className="flex items-center gap-2.5">
          <FileText size={15} className="text-accent" />
          <span className="font-medium text-text-primary">Export & Share</span>
        </span>
        <div className="flex items-center gap-2">
          {hasContent && (
            <span className="text-[10px] bg-accent/15 text-accent px-2 py-0.5 rounded-full font-semibold">
              {currentFmt.label}
            </span>
          )}
          {isOpen ? <ChevronUp size={14} className="text-text-dim" /> : <ChevronDown size={14} className="text-text-dim" />}
        </div>
      </button>

      {isOpen && (
        <div className="space-y-3 animate-fade-up">

          {/* Format tabs */}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
            {FORMATS.map(f => (
              <button
                key={f.key}
                onClick={() => handleFormatChange(f.key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all flex-shrink-0 border',
                  format === f.key
                    ? 'bg-accent text-white border-transparent shadow-glow-sm'
                    : 'bg-bg-card text-text-secondary border-bg-border/60 hover:bg-bg-hover'
                )}
              >
                {f.icon}
                {f.label}
              </button>
            ))}
          </div>

          {/* Description */}
          <p className="text-[11px] text-text-dim px-0.5">{currentFmt.desc}</p>

          {/* Preview */}
          {loading ? (
            <div className="flex items-center justify-center py-12 bg-bg-card rounded-2xl border border-bg-border/60">
              <Loader2 size={20} className="animate-spin text-accent" />
            </div>
          ) : format === 'cards' && jsonData ? (
            <CardsPreview data={jsonData} />
          ) : format === 'markdown' && rawText ? (
            <MarkdownPreview text={rawText} />
          ) : rawText ? (
            <CodePreview text={rawText} />
          ) : null}

          {/* Actions */}
          {hasContent && (
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all duration-200 active:scale-95',
                  copied
                    ? 'bg-emerald/15 text-emerald border border-emerald/25'
                    : 'bg-accent text-white hover:bg-accent-hover'
                )}
              >
                {copied ? <CheckCheck size={15} /> : <Copy size={15} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>

              <button
                onClick={handleDownload}
                className="w-11 h-11 flex items-center justify-center rounded-xl bg-bg-card border border-bg-border/60 text-text-secondary hover:bg-bg-hover hover:text-accent transition-colors active:scale-95 flex-shrink-0"
                title={`Download .${currentFmt.ext}`}
              >
                <Download size={16} />
              </button>

              <button
                onClick={handleShare}
                className="w-11 h-11 flex items-center justify-center rounded-xl bg-bg-card border border-bg-border/60 text-text-secondary hover:bg-bg-hover hover:text-accent transition-colors active:scale-95 flex-shrink-0"
                title="Share"
              >
                <Share2 size={16} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Plain text / JSON preview ──────────────────────────────────
function CodePreview({ text }: { text: string }) {
  return (
    <div className="relative">
      <pre className="bg-bg-card border border-bg-border/60 rounded-2xl p-4 text-xs text-text-secondary font-mono leading-relaxed overflow-x-auto max-h-56 scrollable whitespace-pre-wrap break-words">
        {text}
      </pre>
      <div className="absolute bottom-0 left-0 right-0 h-8 rounded-b-2xl bg-gradient-to-t from-bg-card to-transparent pointer-events-none" />
    </div>
  )
}

// ── Markdown preview ───────────────────────────────────────────
function MdInline({ children, className }: { children: string; className?: string }) {
  // Split on **bold** and `code` tokens
  const parts = children.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  if (parts.length === 1) return <span className={className}>{children}</span>
  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={i} className="font-semibold text-text-primary">
              {part.slice(2, -2)}
            </strong>
          )
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code key={i} className="bg-bg-hover px-1 rounded text-accent text-[10px] font-mono">
              {part.slice(1, -1)}
            </code>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </span>
  )
}

function MarkdownPreview({ text }: { text: string }) {
  const lines = text.split('\n')

  return (
    <div className="bg-bg-card border border-bg-border/60 rounded-2xl p-4 max-h-56 overflow-y-auto scrollable space-y-0.5">
      {lines.map((line, i) => {
        // H1
        if (/^# /.test(line)) return (
          <p key={i} className="text-sm font-bold text-text-primary pb-1">{line.slice(2)}</p>
        )
        // H2
        if (/^## /.test(line)) return (
          <p key={i} className="text-[11px] font-semibold text-accent pt-2.5 pb-0.5 uppercase tracking-wider">{line.slice(3)}</p>
        )
        // Blockquote (with optional leading spaces for descriptions)
        if (/^ {0,4}> /.test(line)) return (
          <p key={i} className="text-[11px] text-text-dim italic border-l-2 border-accent/30 pl-2">
            {line.replace(/^ *> /, '')}
          </p>
        )
        // Subtask checked (2–4 spaces indent)
        if (/^ {2,4}- \[x\] /.test(line)) return (
          <div key={i} className="flex items-start gap-1.5 py-0.5 pl-5">
            <span className="text-emerald text-[10px] flex-shrink-0 mt-px">✓</span>
            <span className="text-[11px] text-text-dim line-through">{line.replace(/^ +- \[x\] /, '')}</span>
          </div>
        )
        // Subtask unchecked
        if (/^ {2,4}- \[ \] /.test(line)) return (
          <div key={i} className="flex items-start gap-1.5 py-0.5 pl-5">
            <span className="text-text-dim text-[10px] flex-shrink-0 mt-px">·</span>
            <span className="text-[11px] text-text-secondary">{line.replace(/^ +- \[ \] /, '')}</span>
          </div>
        )
        // Top-level checked task
        if (/^- \[x\] /.test(line)) return (
          <div key={i} className="flex items-start gap-2 py-0.5">
            <span className="text-emerald text-xs flex-shrink-0 mt-px">✓</span>
            <MdInline className="text-xs text-text-dim line-through">{line.slice(6)}</MdInline>
          </div>
        )
        // Top-level unchecked task
        if (/^- \[ \] /.test(line)) return (
          <div key={i} className="flex items-start gap-2 py-0.5">
            <span className="text-text-dim text-xs flex-shrink-0 mt-px">○</span>
            <MdInline className="text-xs text-text-primary">{line.slice(6)}</MdInline>
          </div>
        )
        // Empty line
        if (line === '') return <div key={i} className="h-1.5" />
        // Default
        return <p key={i} className="text-[11px] text-text-secondary leading-relaxed">{line}</p>
      })}
    </div>
  )
}

// ── Cards preview ──────────────────────────────────────────────
function CardsPreview({ data }: { data: ExportData }) {
  const grouped = STATUS_ORDER.reduce<Record<string, Task[]>>((acc, status) => {
    const items = data.tasks.filter(t => t.status === status)
    if (items.length) acc[status] = items
    return acc
  }, {})

  if (!data.tasks.length) return (
    <div className="flex items-center justify-center py-8 bg-bg-card border border-bg-border/60 rounded-2xl">
      <p className="text-xs text-text-dim">No tasks to preview</p>
    </div>
  )

  return (
    <div className="bg-bg-card border border-bg-border/60 rounded-2xl p-3 max-h-64 overflow-y-auto scrollable space-y-4">
      {STATUS_ORDER.filter(s => grouped[s]).map(status => (
        <div key={status}>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-[10px] font-semibold text-text-dim uppercase tracking-widest">
              {STATUS_META[status].label}
            </p>
            <span className="text-[10px] text-text-dim">({grouped[status].length})</span>
          </div>
          <div className="space-y-1.5">
            {grouped[status].map(task => <MiniCard key={task.id} task={task} />)}
          </div>
        </div>
      ))}
    </div>
  )
}

function MiniCard({ task }: { task: Task }) {
  const priority = PRIORITY_CONFIG[task.priority as keyof typeof PRIORITY_CONFIG]
  const isDone   = task.status === 'done'
  const subDone  = task.subtasks?.filter(s => s.completed).length ?? 0
  const subTotal = task.subtasks?.length ?? 0
  const due      = task.due_at ?? task.due_date

  return (
    <div className={cn(
      'flex items-center gap-2.5 px-3 py-2 rounded-[12px] border border-bg-border/40 bg-bg-surface transition-opacity',
      isDone && 'opacity-50'
    )}>
      {/* Status stripe */}
      <div className={cn('w-1 h-6 rounded-full flex-shrink-0', STATUS_META[task.status]?.dot ?? 'bg-bg-border')} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={cn('text-xs font-medium truncate', isDone && 'line-through text-text-dim')}>
          {task.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {priority && (
            <span className={cn('text-[10px] font-medium', priority.color)}>{priority.label}</span>
          )}
          {subTotal > 0 && (
            <span className="text-[10px] text-text-dim flex items-center gap-0.5">
              <CheckCircle2 size={9} /> {subDone}/{subTotal}
            </span>
          )}
          {due && (
            <span className="text-[10px] text-text-dim flex items-center gap-0.5">
              <Calendar size={9} />
              {new Date(due).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}