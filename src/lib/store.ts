import { create } from 'zustand'
import type { TaskList, Task, Subtask } from '@/types'

interface TaskStore {
  lists:       TaskList[]
  tasks:       Record<string, Task[]>  // keyed by listId
  activeListId: string | null
  userId:      number | null

  setUserId:      (id: number) => void
  setLists:       (lists: TaskList[]) => void
  setActiveList:  (id: string | null) => void
  setTasks:       (listId: string, tasks: Task[]) => void
  addList:        (list: TaskList) => void
  updateList:     (id: string, data: Partial<TaskList>) => void
  removeList:     (id: string) => void
  addTask:        (task: Task) => void
  updateTask:     (id: string, data: Partial<Task>) => void
  removeTask:     (id: string, listId: string) => void
  reorderTasks:   (listId: string, tasks: Task[]) => void
  updateSubtasks: (taskId: string, listId: string, subtasks: Subtask[]) => void
}

export const useTaskStore = create<TaskStore>((set) => ({
  lists:        [],
  tasks:        {},
  activeListId: null,
  userId:       null,

  setUserId: (id) => set({ userId: id }),

  setLists: (lists) => set({ lists }),

  setActiveList: (id) => set({ activeListId: id }),

  setTasks: (listId, tasks) =>
    set(s => ({ tasks: { ...s.tasks, [listId]: tasks } })),

  addList: (list) =>
    set(s => ({ lists: [list, ...s.lists] })),

  updateList: (id, data) =>
    set(s => ({ lists: s.lists.map(l => l.id === id ? { ...l, ...data } : l) })),

  removeList: (id) =>
    set(s => {
      const { [id]: _, ...rest } = s.tasks
      return { lists: s.lists.filter(l => l.id !== id), tasks: rest }
    }),

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
        updated[listId] = updated[listId].map(t => t.id === id ? { ...t, ...data } : t)
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
}))
