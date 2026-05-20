'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS }         from '@dnd-kit/utilities'
import { TaskCard }    from '@/components/tasks/TaskCard'
import type { Task }   from '@/types'

export interface SortableCardProps {
  task:        Task
  userId:      number
  isViewer:    boolean
  isDragMode:  boolean
  isDragging:  boolean
  onToggle:    (task: Task) => void
  onOpen:      (task: Task) => void
  onLongPress: (x: number, y: number) => void
  isSwiping?:  React.MutableRefObject<boolean>
  isUnread?:   boolean
}

export function SortableTaskCard({
  task, userId, isViewer, isDragMode, isDragging,
  onToggle, onOpen, onLongPress, isSwiping, isUnread,
}: SortableCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id:       task.id,
    disabled: !isDragMode,
  })

  return (
    <div
      ref={setNodeRef}
      className="task-item"
      style={{
        transform:  CSS.Transform.toString(transform),
        // Ускоряем transition для более отзывчивого drag
        transition: transition ? transition.replace(/\d+ms/, '120ms') : undefined,
        opacity:    isDragging ? 0.35 : 1,
      }}
    >
      <TaskCard
        task={task}
        userId={userId}
        isViewer={isViewer}
        isDragMode={isDragMode}
        dragListeners={listeners}
        //dragAttributes={attributes}
        onToggle={onToggle}
        onOpen={onOpen}
        onLongPress={onLongPress}
        isSwiping={isSwiping}
        isUnread={isUnread}
      />
    </div>
  )
}