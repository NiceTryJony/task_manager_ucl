'use client'

import { useRef } from 'react'
import { gsap } from 'gsap'
import { ChevronRight, CheckCircle2, Circle } from 'lucide-react'
import type { TaskList } from '@/types'
import { cn } from '@/lib/utils'

interface Props {
  list: TaskList
  onClick: () => void
}

export function ListCard({ list, onClick }: Props) {
  const cardRef = useRef<HTMLButtonElement>(null)
  const progress = list.task_count ? Math.round(((list.done_count ?? 0) / list.task_count) * 100) : 0

  function handlePress() {
    if (!cardRef.current) return
    gsap.to(cardRef.current, {
      scale: 0.97,
      duration: 0.1,
      ease: 'power2.out',
      onComplete: () => {
        gsap.to(cardRef.current, { scale: 1, duration: 0.2, ease: 'back.out(2)' })
        onClick()
      }
    })
  }

  return (
    <button
      ref={cardRef}
      onClick={handlePress}
      className={cn(
        'card w-full text-left p-4 transition-colors duration-150',
        'hover:bg-bg-hover active:bg-bg-hover'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Emoji badge */}
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
          style={{ background: `${list.color}20` }}
        >
          {list.emoji}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-base truncate">{list.title}</h3>
            <ChevronRight size={14} className="text-text-dim flex-shrink-0 ml-auto" />
          </div>

          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-text-secondary">
              {list.task_count ?? 0} task{list.task_count !== 1 ? 's' : ''}
            </span>
            {(list.done_count ?? 0) > 0 && (
              <>
                <span className="text-text-dim">·</span>
                <span className="text-sm text-emerald flex items-center gap-1">
                  <CheckCircle2 size={12} />
                  {list.done_count} done
                </span>
              </>
            )}
          </div>

          {/* Progress bar */}
          {(list.task_count ?? 0) > 0 && (
            <div className="mt-2.5 h-1 bg-bg-hover rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progress}%`,
                  background: progress === 100 ? '#34D399' : list.color,
                }}
              />
            </div>
          )}
        </div>
      </div>
    </button>
  )
}
