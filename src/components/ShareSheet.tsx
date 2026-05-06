'use client'

import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { X, UserPlus, Check, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface Props {
  listId:  string
  userId:  number
  onClose: () => void
}

export function ShareSheet({ listId, userId, onClose }: Props) {
  const [inviteId,  setInviteId]  = useState('')
  const [role,      setRole]      = useState<'editor' | 'viewer'>('editor')
  const [loading,   setLoading]   = useState(false)
  const [result,    setResult]    = useState<{ ok: boolean; message: string } | null>(null)

  const sheetRef   = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2 })
    gsap.fromTo(sheetRef.current,   { y: '100%' }, { y: 0, duration: 0.35, ease: 'power3.out' })
  }, [])

  function close() {
    gsap.to(sheetRef.current,   { y: '100%', duration: 0.25, ease: 'power3.in' })
    gsap.to(overlayRef.current, { opacity: 0, duration: 0.2, onComplete: onClose })
  }

  async function handleInvite() {
    const id = Number(inviteId.trim())
    if (!id || isNaN(id)) {
      setResult({ ok: false, message: 'Enter a valid Telegram numeric ID' })
      return
    }
    if (id === userId) {
      setResult({ ok: false, message: "You can't invite yourself" })
      return
    }

    setLoading(true)
    setResult(null)

    const res = await fetch('/api/lists/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listId, ownerId: userId, invitedUserId: id, role }),
    })
    const data = await res.json()

    if (data.ok) {
      const name = data.user?.first_name ?? `User ${id}`
      setResult({ ok: true, message: `${name} has been invited!` })
      toast.success(`Invited ${name}`)
      setInviteId('')
    } else {
      setResult({ ok: false, message: data.error ?? 'Something went wrong' })
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div ref={overlayRef} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} />

      <div ref={sheetRef} className="relative w-full bg-bg-surface rounded-t-3xl border-t border-bg-border px-4 pt-3 pb-8 z-10">
        <div className="w-10 h-1 bg-bg-border rounded-full mx-auto mb-4" />
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold">Share List</h2>
          <button onClick={close} className="btn-ghost p-2"><X size={18} /></button>
        </div>

        {/* Explanation */}
        <div className="bg-accent/10 border border-accent/20 rounded-xl p-3.5 mb-5">
          <p className="text-sm text-text-secondary leading-relaxed">
            Enter the <span className="text-text-primary font-medium">Telegram numeric ID</span> of the person you want to invite.
            They must have opened TaskFlow at least once.
          </p>
          <p className="text-xs text-text-dim mt-1.5">
            💡 They can find their ID by messaging @userinfobot in Telegram
          </p>
        </div>

        {/* Input */}
        <input
          type="number"
          value={inviteId}
          onChange={e => setInviteId(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleInvite()}
          placeholder="Telegram user ID (e.g. 123456789)"
          className="input-field mb-4 font-mono"
        />

        {/* Role selector */}
        <label className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-2 block">
          Permission
        </label>
        <div className="flex gap-2 mb-5">
          {(['editor', 'viewer'] as const).map(r => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={cn(
                'flex-1 py-2.5 rounded-xl text-sm font-medium transition-all',
                role === r
                  ? 'bg-accent text-white'
                  : 'bg-bg-card text-text-secondary hover:bg-bg-hover'
              )}
            >
              {r === 'editor' ? '✏️ Can edit' : '👁 View only'}
            </button>
          ))}
        </div>

        {/* Result */}
        {result && (
          <div className={cn(
            'flex items-center gap-2.5 p-3 rounded-xl mb-4 text-sm',
            result.ok
              ? 'bg-emerald/10 text-emerald border border-emerald/20'
              : 'bg-danger/10 text-danger border border-danger/20'
          )}>
            {result.ok ? <Check size={16} /> : <AlertCircle size={16} />}
            {result.message}
          </div>
        )}

        <button
          onClick={handleInvite}
          disabled={!inviteId.trim() || loading}
          className="btn-primary w-full py-3.5 flex items-center justify-center gap-2 disabled:opacity-40"
        >
          <UserPlus size={18} />
          {loading ? 'Inviting…' : 'Invite'}
        </button>
      </div>
    </div>
  )
}
