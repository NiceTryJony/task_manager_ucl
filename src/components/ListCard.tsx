'use client'

import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { CheckCircle2, MoreVertical, Pencil, Trash2, X, Share2 } from 'lucide-react'
import type { TaskList } from '@/types'
import { cn, LIST_COLORS, LIST_EMOJIS } from '@/lib/utils'
import { useI18n } from '@/lib/i18n-context'

interface Props {
  list:      TaskList
  userId:    number
  onClick:   () => void
  onEdited:  (list: TaskList) => void
  onDeleted: (id: string) => void
  onShare:   (list: TaskList) => void
}

export function ListCard({ list, userId, onClick, onEdited, onDeleted, onShare }: Props) {
  const { t } = useI18n()
  const cardRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const btnRef  = useRef<HTMLButtonElement>(null)

  const [showMenu, setShowMenu] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [title,    setTitle]    = useState(list.title)
  const [emoji,    setEmoji]    = useState(list.emoji)
  const [color,    setColor]    = useState(list.color)
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)

  const progress  = list.task_count
    ? Math.round(((list.done_count ?? 0) / list.task_count) * 100)
    : 0
  const isAllDone = (list.task_count ?? 0) > 0 && progress === 100

  useEffect(() => {
    if (!showMenu) return
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (
        menuRef.current?.contains(e.target as Node) ||
        btnRef.current?.contains(e.target as Node)
      ) return
      setShowMenu(false)
    }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown',  handleOutside)
      document.addEventListener('touchstart', handleOutside)
    }, 10)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown',  handleOutside)
      document.removeEventListener('touchstart', handleOutside)
    }
  }, [showMenu])

  useEffect(() => {
    if (!showMenu || !menuRef.current) return
    gsap.fromTo(menuRef.current,
      { scale: 0.88, opacity: 0, y: -4 },
      { scale: 1, opacity: 1, y: 0, duration: 0.22, ease: 'back.out(2)' }
    )
  }, [showMenu])

  function handleCardClick() {
    if (showMenu || showEdit) return
    if (!cardRef.current) { onClick(); return }
    gsap.to(cardRef.current, {
      scale: 0.975, duration: 0.1, ease: 'power2.out',
      onComplete: () => {
        gsap.to(cardRef.current, { scale: 1, duration: 0.18, ease: 'back.out(2)' })
        onClick()
      },
    })
  }

  function toggleMenu(e: React.MouseEvent) {
    e.stopPropagation()
    setShowMenu(v => !v)
  }

  async function handleSaveEdit() {
    if (!title.trim()) return
    setSaving(true)
    const res  = await fetch('/api/lists', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listId: list.id, userId, title: title.trim(), emoji, color }),
    })
    const data = await res.json()
    if (data.list) onEdited(data.list)
    setSaving(false)
    setShowEdit(false)
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    setShowMenu(false)

    const confirmed = await new Promise<boolean>(resolve => {
      if (window?.Telegram?.WebApp?.showConfirm) {
        window.Telegram.WebApp.showConfirm(`${t('delete')} "${list.title}"?`, resolve)
      } else {
        resolve(window.confirm(`${t('delete')} "${list.title}"?`))
      }
    })
    if (!confirmed) return

    setDeleting(true)
    if (cardRef.current) {
      await gsap.to(cardRef.current, {
        opacity: 0, scale: 0.95, height: 0,
        marginBottom: 0, paddingTop: 0, paddingBottom: 0,
        duration: 0.28, ease: 'power2.in',
      })
    }
    await fetch(`/api/lists?listId=${list.id}&userId=${userId}`, { method: 'DELETE' })
    onDeleted(list.id)
  }

  // ── Edit mode ───────────────────────────────────────────────
  if (showEdit) {
    return (
      <div
        ref={cardRef}
        className="p-4 space-y-3 animate-fade-up"
        style={{
          background:   'rgba(129,115,245,0.07)',
          border:       '0.5px solid rgba(129,115,245,0.22)',
          boxShadow:    'inset 0 1px 0 rgba(255,255,255,0.06)',
          borderRadius: 24,
        }}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-widest">
            {t('editList')}
          </span>
          <button
            onClick={() => {
              setShowEdit(false)
              setTitle(list.title)
              setEmoji(list.emoji)
              setColor(list.color)
            }}
            className="btn-ghost p-1.5 -mr-1"
          >
            <X size={16} />
          </button>
        </div>

        <input
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSaveEdit()}
          className="input-field font-semibold"
          maxLength={60}
          placeholder={t('listName')}
        />

        <div>
          <p className="text-xs text-text-dim mb-2">{t('icon')}</p>
          <div className="flex flex-wrap gap-1.5">
            {LIST_EMOJIS.map(e => (
              <button
                key={e}
                onClick={() => setEmoji(e)}
                className="w-9 h-9 rounded-xl text-lg transition-all duration-150"
                style={emoji === e
                  ? { background: 'rgba(129,115,245,0.18)', outline: '1px solid var(--c-accent)', transform: 'scale(1.1)' }
                  : { background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.08)' }
                }
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-text-dim mb-2">{t('color')}</p>
          <div className="flex gap-2.5">
            {LIST_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="w-7 h-7 rounded-full transition-all duration-150 flex-shrink-0"
                style={{
                  background:    c,
                  outline:       color === c ? `2px solid ${c}` : 'none',
                  outlineOffset: '2px',
                  transform:     color === c ? 'scale(1.2)' : 'scale(1)',
                  boxShadow:     color === c ? `0 0 10px ${c}55` : 'none',
                }}
              />
            ))}
          </div>
        </div>

        <div className="h-1 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}66` }} />

        <button
          onClick={handleSaveEdit}
          disabled={!title.trim() || saving}
          className="btn-primary w-full py-2.5 text-sm disabled:opacity-40"
        >
          {saving ? t('saving') : t('saveChanges')}
        </button>
      </div>
    )
  }

  // ── Normal card ─────────────────────────────────────────────
  const taskCount = list.task_count ?? 0
  const doneCount = list.done_count ?? 0

  return (
    <div ref={cardRef} className="relative">
      <div className="card-shell">
        <div
          onClick={handleCardClick}
          className="card p-4 cursor-pointer overflow-hidden"
          style={{ transition: 'background 150ms ease, transform 150ms ease' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--card-bg)' }}
        >
          {/* Left color stripe */}
          <div
            className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full"
            style={{ background: list.color, boxShadow: `0 0 8px ${list.color}66` }}
          />

          <div className="flex items-start gap-3 pl-2">
            <div
              className="w-11 h-11 rounded-[14px] flex items-center justify-center text-xl flex-shrink-0"
              style={{
                background: `${list.color}18`,
                boxShadow:  `inset 0 1px 0 rgba(255,255,255,0.10)`,
              }}
            >
              {list.emoji}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 mb-1">
                <h3 className="font-semibold text-[15px] leading-snug truncate flex-1 text-text-primary">
                  {list.title}
                </h3>
                <button
                  ref={btnRef}
                  onClick={toggleMenu}
                  className={cn(
                    'flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-[10px]',
                    'transition-all duration-150 -mr-1',
                  )}
                  style={showMenu
                    ? { background: 'rgba(255,255,255,0.10)', color: 'var(--text-secondary)' }
                    : { color: 'var(--text-dim)' }
                  }
                  onMouseEnter={e => { if (!showMenu) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)' }}
                  onMouseLeave={e => { if (!showMenu) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <MoreVertical size={15} />
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs text-text-secondary">
                <span>{taskCount} {taskCount === 1 ? t('taskWord') : t('tasksWord')}</span>
                {doneCount > 0 && (
                  <>
                    <span className="text-text-dim">·</span>
                    <span className="flex items-center gap-1 text-emerald">
                      <CheckCircle2 size={11} />
                      {doneCount} {t('done')}
                    </span>
                  </>
                )}
                {isAllDone && (
                  <>
                    <span className="text-text-dim">·</span>
                    <span className="font-semibold text-emerald">100%</span>
                  </>
                )}
              </div>

              {taskCount > 0 && (
                <div
                  className="mt-2.5 h-[3px] rounded-full overflow-hidden"
                  style={{ background: 'rgba(255,255,255,0.07)' }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width:      `${progress}%`,
                      background: isAllDone
                        ? 'linear-gradient(90deg,#3ECF8E,#22B97A)'
                        : list.color,
                      boxShadow:  isAllDone ? '0 0 6px rgba(62,207,142,0.40)' : `0 0 6px ${list.color}55`,
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Dropdown menu — glassmorphism */}
      {showMenu && (
        <div
          ref={menuRef}
          className="absolute right-3 top-14 z-30 overflow-hidden"
          style={{
            minWidth:            152,
            transformOrigin:     'top right',
            borderRadius:        16,
            background:          'var(--dropdown-bg)',
            backdropFilter:      'var(--glass-blur)',
            WebkitBackdropFilter:'var(--glass-blur)',
            border:              '0.5px solid var(--dropdown-border)',
            boxShadow:           'var(--dropdown-shadow)',
          }}
        >
          {/* Top-edge highlight */}
          <div
            className="absolute top-0 left-0 right-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)' }}
          />

          <button
            onClick={e => { e.stopPropagation(); setShowMenu(false); setShowEdit(true) }}
            className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium w-full text-left text-text-primary transition-colors"
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            <Pencil size={14} style={{ color: 'var(--c-accent)', flexShrink: 0 }} />
            {t('edit')}
          </button>

          <div className="h-px mx-2.5" style={{ background: 'rgba(255,255,255,0.07)' }} />

          <button
            onClick={e => { e.stopPropagation(); setShowMenu(false); onShare(list) }}
            className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium w-full text-left text-text-primary transition-colors"
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            <Share2 size={14} className="text-text-secondary flex-shrink-0" />
            {t('share')}
          </button>

          <div className="h-px mx-2.5" style={{ background: 'rgba(255,255,255,0.07)' }} />

          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium w-full text-left text-danger transition-colors disabled:opacity-50"
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(240,112,112,0.10)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            <Trash2 size={14} className="flex-shrink-0" />
            {deleting ? t('deleting') : t('delete')}
          </button>
        </div>
      )}
    </div>
  )
}