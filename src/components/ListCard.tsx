'use client'

import { useRef, useState } from 'react'
import { gsap } from 'gsap'
import { ChevronRight, CheckCircle2, MoreVertical, Pencil, Trash2, X } from 'lucide-react'
import type { TaskList } from '@/types'
import { cn } from '@/lib/utils'

interface Props {
  list:     TaskList
  userId:   number
  onClick:  () => void
  onEdited: (list: TaskList) => void
  onDeleted:(id: string) => void
}

import { LIST_COLORS, LIST_EMOJIS } from '@/lib/utils'

export function ListCard({ list, userId, onClick, onEdited, onDeleted }: Props) {
  const cardRef    = useRef<HTMLDivElement>(null)
  const [showMenu, setShowMenu]   = useState(false)
  const [showEdit, setShowEdit]   = useState(false)
  const [title,    setTitle]      = useState(list.title)
  const [emoji,    setEmoji]      = useState(list.emoji)
  const [color,    setColor]      = useState(list.color)
  const [saving,   setSaving]     = useState(false)
  const [deleting, setDeleting]   = useState(false)

  const progress = list.task_count ? Math.round(((list.done_count ?? 0) / list.task_count) * 100) : 0

  function handleCardClick() {
    if (showMenu || showEdit) return
    if (!cardRef.current) { onClick(); return }
    gsap.to(cardRef.current, {
      scale: 0.97, duration: 0.1, ease: 'power2.out',
      onComplete: () => {
        gsap.to(cardRef.current, { scale: 1, duration: 0.2, ease: 'back.out(2)' })
        onClick()
      },
    })
  }

  async function handleSaveEdit() {
    if (!title.trim()) return
    setSaving(true)
    const res  = await fetch('/api/lists', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listId: list.id, userId, title: title.trim(), emoji, color }),
    })
    const data = await res.json()
    if (data.list) onEdited(data.list)
    setSaving(false)
    setShowEdit(false)
  }

  async function handleDelete() {
    setDeleting(true)
    if (cardRef.current) {
      await gsap.to(cardRef.current, { opacity: 0, height: 0, marginBottom: 0, duration: 0.25, ease: 'power2.in' })
    }
    await fetch(`/api/lists?listId=${list.id}&userId=${userId}`, { method: 'DELETE' })
    onDeleted(list.id)
  }

  return (
    <div ref={cardRef}>
      {/* Edit sheet */}
      {showEdit && (
        <div className="card p-4 space-y-3 border border-accent/20">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold text-text-secondary uppercase tracking-widest">Edit List</span>
            <button onClick={() => setShowEdit(false)} className="btn-ghost p-1.5"><X size={15}/></button>
          </div>
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSaveEdit()}
            className="input-field font-semibold"
            maxLength={60}
          />
          {/* Emoji row */}
          <div className="flex flex-wrap gap-1.5">
            {LIST_EMOJIS.map(e => (
              <button key={e} onClick={() => setEmoji(e)}
                className={cn('w-9 h-9 rounded-xl text-lg transition-all',
                  emoji === e ? 'bg-accent/20 ring-1 ring-accent scale-110' : 'bg-bg-card hover:bg-bg-hover'
                )}>{e}</button>
            ))}
          </div>
          {/* Color row */}
          <div className="flex gap-2">
            {LIST_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                className="w-7 h-7 rounded-full transition-all"
                style={{ background: c, outline: color === c ? `2px solid ${c}` : 'none', outlineOffset: 2, transform: color === c ? 'scale(1.2)' : 'scale(1)' }}
              />
            ))}
          </div>
          <button onClick={handleSaveEdit} disabled={!title.trim() || saving}
            className="btn-primary w-full py-2.5 text-sm disabled:opacity-40">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}

      {/* Card */}
      {!showEdit && (
        <div
          onClick={handleCardClick}
          className={cn('card p-4 cursor-pointer transition-colors hover:bg-bg-hover active:bg-bg-hover relative')}
        >
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
              style={{ background: `${list.color}20` }}>
              {list.emoji}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <h3 className="font-semibold text-base truncate flex-1">{list.title}</h3>
                <button
                  onClick={e => { e.stopPropagation(); setShowMenu(!showMenu) }}
                  className="btn-ghost p-1.5 -mr-1 flex-shrink-0"
                >
                  <MoreVertical size={15} className="text-text-dim" />
                </button>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-text-secondary">
                  {list.task_count ?? 0} task{list.task_count !== 1 ? 's' : ''}
                </span>
                {(list.done_count ?? 0) > 0 && (
                  <>
                    <span className="text-text-dim">·</span>
                    <span className="text-sm text-emerald flex items-center gap-1">
                      <CheckCircle2 size={12} />{list.done_count} done
                    </span>
                  </>
                )}
              </div>
              {(list.task_count ?? 0) > 0 && (
                <div className="mt-2.5 h-1 bg-bg-hover rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${progress}%`, background: progress === 100 ? '#34D399' : list.color }} />
                </div>
              )}
            </div>
          </div>

          {/* Inline mini-menu */}
          {showMenu && (
            <div className="absolute right-3 top-12 z-20 bg-bg-surface border border-bg-border rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden animate-scale-pop min-w-[140px]">
              <button onClick={e => { e.stopPropagation(); setShowMenu(false); setShowEdit(true) }}
                className="flex items-center gap-2.5 px-4 py-3 text-sm font-medium hover:bg-bg-hover w-full text-left text-text-primary transition-colors">
                <Pencil size={14} className="text-accent flex-shrink-0" />
                Edit
              </button>
              <div className="h-px bg-bg-border mx-2" />
              <button onClick={e => { e.stopPropagation(); setShowMenu(false); handleDelete() }}
                disabled={deleting}
                className="flex items-center gap-2.5 px-4 py-3 text-sm font-medium hover:bg-danger/10 w-full text-left text-danger transition-colors disabled:opacity-50">
                <Trash2 size={14} className="flex-shrink-0" />
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}