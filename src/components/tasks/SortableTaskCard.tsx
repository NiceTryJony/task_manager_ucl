'use client'

/**
 * SortableTaskCard
 *
 * Тонкая обёртка: вся dnd-kit логика здесь, TaskCard остаётся чистым.
 *
 * Ключевые решения:
 * - setActivatorNodeRef пробрасывается как dragActivatorRef → на grip-handle
 *   (нужен для корректного расчёта scroll-offset в TouchSensor)
 * - listeners и attributes передаются с точными типами из ReturnType<useSortable>
 *   (это устраняет TS-ошибку "DraggableAttributes not assignable to Record<string, unknown>")
 * - transform transition ускорен до 120ms для более живого ощущения при drag
 */

import { useSortable } from '@dnd-kit/sortable'
import { CSS }         from '@dnd-kit/utilities'
import { TaskCard }    from '@/components/tasks/TaskCard'
import type { Task }   from '@/types'

export interface SortableCardProps {
  task:        Task
  userId:      number
  isViewer:    boolean
  isDragMode:  boolean
  /** true когда ЭТА карточка перетаскивается (показываем placeholder с opacity 0.35) */
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

  const {
    attributes,           // DraggableAttributes — aria-* для доступности
    listeners,            // SyntheticListenerMap — события для старта drag
    setNodeRef,           // ref на контейнер (dnd-kit отслеживает позицию)
    setActivatorNodeRef,  // ref на drag-handle (для TouchSensor scroll-offset)
    transform,
    transition,
  } = useSortable({
    id:       task.id,
    disabled: !isDragMode,  // Выключаем dnd когда режим не drag (sort by due/priority)
  })

  return (
    <div
      ref={setNodeRef}
      className="task-item"
      style={{
        transform: CSS.Transform.toString(transform),
        // Оригинальный transition от dnd-kit обычно 250ms — немного медленновато.
        // Заменяем на 120ms для более отзывчивого ощущения.
        transition: transition
          ? transition.replace(/\d+ms/, '120ms')
          : undefined,
        // Placeholder на месте перетаскиваемой карточки
        opacity: isDragging ? 0.35 : 1,
      }}
    >
      <TaskCard
        task={task}
        userId={userId}
        isViewer={isViewer}
        isDragMode={isDragMode}
        dragListeners={listeners}
        dragAttributes={attributes}
        dragActivatorRef={setActivatorNodeRef}
        onToggle={onToggle}
        onOpen={onOpen}
        onLongPress={onLongPress}
        isSwiping={isSwiping}
        isUnread={isUnread}
      />
    </div>
  )
}