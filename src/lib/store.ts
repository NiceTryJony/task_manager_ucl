import { create } from 'zustand'
import type { TaskList, Task, Subtask, TaskAssignee } from '@/types'

// ── ListMember — вынести также в @/types если используется в других местах
export interface ListMember {
  user_id: number
  users:   TaskAssignee
}

interface TaskStore {
  // ── Данные ──────────────────────────────────────────────────
  lists:        TaskList[]
  tasks:        Record<string, Task[]>      // listId → Task[]
  activeListId: string | null
  userId:       number | null

  // ── Кеши ────────────────────────────────────────────────────
  membersCache: Record<string, ListMember[]> // listId → members (не фетчим повторно)

  // ── Pending ops (SaveBanner) ─────────────────────────────────
  pendingOps:    number
  lastSaveError: boolean

  // ── Навигация ────────────────────────────────────────────────
  pendingTaskId: string | null  // auto-open после смены списка

  // ── Actions ─────────────────────────────────────────────────
  incrementPending:  () => void
  decrementPending:  (hasError?: boolean) => void

  setUserId:         (id: number) => void
  setLists:          (lists: TaskList[]) => void
  setActiveList:     (id: string | null) => void
  setTasks:          (listId: string, tasks: Task[]) => void

  addList:           (list: TaskList) => void
  updateList:        (id: string, data: Partial<TaskList>) => void
  removeList:        (id: string) => void

  addTask:           (task: Task) => void
  updateTask:        (id: string, data: Partial<Task>) => void
  removeTask:        (id: string, listId: string) => void
  reorderTasks:      (listId: string, tasks: Task[]) => void
  updateSubtasks:    (taskId: string, listId: string, subtasks: Subtask[]) => void

  setPendingTaskId:  (id: string | null) => void

  // ── Cache actions ────────────────────────────────────────────
  setMembersCache:   (listId: string, members: ListMember[]) => void
  clearMembersCache: (listId?: string) => void  // без аргумента — чистит всё
}

export const useTaskStore = create<TaskStore>((set) => ({
  // ── Initial state ────────────────────────────────────────────
  lists:         [],
  tasks:         {},
  activeListId:  null,
  userId:        null,
  membersCache:  {},
  pendingOps:    0,
  lastSaveError: false,
  pendingTaskId: null,

  // ── Pending ──────────────────────────────────────────────────
  incrementPending: () =>
    set(s => ({ pendingOps: s.pendingOps + 1, lastSaveError: false })),

  decrementPending: (hasError = false) =>
    set(s => ({
      pendingOps:    Math.max(0, s.pendingOps - 1),
      lastSaveError: hasError,
    })),

  // ── User ─────────────────────────────────────────────────────
  setUserId: (id) => set({ userId: id }),

  // ── Lists ────────────────────────────────────────────────────
  setLists:     (lists) => set({ lists }),
  setActiveList: (id)   => set({ activeListId: id }),

  addList: (list) =>
    set(s => ({ lists: [list, ...s.lists] })),

  updateList: (id, data) =>
    set(s => ({
      lists: s.lists.map(l => l.id === id ? { ...l, ...data } : l),
    })),

  removeList: (id) =>
    set(s => {
      const { [id]: _, ...restTasks } = s.tasks
      const { [id]: __, ...restCache } = s.membersCache
      return {
        lists:        s.lists.filter(l => l.id !== id),
        tasks:        restTasks,
        membersCache: restCache,  // чистим кеш при удалении списка
      }
    }),

  // ── Tasks ────────────────────────────────────────────────────
  setTasks: (listId, tasks) =>
    set(s => ({ tasks: { ...s.tasks, [listId]: tasks } })),

  addTask: (task) =>
    set(s => ({
      tasks: {
        ...s.tasks,
        [task.list_id]: [task, ...(s.tasks[task.list_id] ?? [])],
      },
    })),

  updateTask: (id, data) =>
    set(s => {
      const updated = { ...s.tasks }
      for (const listId in updated) {
        updated[listId] = updated[listId].map(t =>
          t.id === id ? { ...t, ...data } : t
        )
      }
      return { tasks: updated }
    }),

  removeTask: (id, listId) =>
    set(s => ({
      tasks: {
        ...s.tasks,
        [listId]: (s.tasks[listId] ?? []).filter(t => t.id !== id),
      },
    })),

  reorderTasks: (listId, tasks) =>
    set(s => ({ tasks: { ...s.tasks, [listId]: tasks } })),

  updateSubtasks: (taskId, listId, subtasks) =>
    set(s => ({
      tasks: {
        ...s.tasks,
        [listId]: (s.tasks[listId] ?? []).map(t =>
          t.id === taskId ? { ...t, subtasks } : t
        ),
      },
    })),

  // ── Navigation ───────────────────────────────────────────────
  setPendingTaskId: (id) => set({ pendingTaskId: id }),

  // ── Members cache ────────────────────────────────────────────
  setMembersCache: (listId, members) =>
    set(s => ({
      membersCache: { ...s.membersCache, [listId]: members },
    })),

  clearMembersCache: (listId) =>
    set(s => {
      if (!listId) return { membersCache: {} }
      const { [listId]: _, ...rest } = s.membersCache
      return { membersCache: rest }
    }),
}))