export type Priority   = 'low' | 'medium' | 'high' | 'urgent'
export type TaskStatus = 'todo' | 'in_progress' | 'done'
export type MemberRole = 'owner' | 'editor' | 'viewer'

export interface TgUser {
  id:          number
  username?:   string
  first_name:  string
  last_name?:  string
}

export interface User {
  id:          number
  username?:   string
  first_name:  string
  last_name?:  string
  created_at:  string
}

export interface TaskList {
  id:          string
  owner_id:    number
  title:       string
  emoji:       string
  color:       string
  task_count?: number
  done_count?: number
  created_at:  string
  updated_at:  string
}

export interface ListMember {
  list_id:    string
  user_id:    number
  role:       MemberRole
  invited_by: number
  joined_at:  string
  user?:      User
}

export interface Subtask {
  id:          string
  task_id:     string
  title:       string
  completed:   boolean
  position:    number
  created_by?: number
  created_at:  string
  // enriched server-side
  creator?: {
    id:         number
    first_name: string
    username?:  string
  } | null
}

export interface Task {
  id:           string
  list_id:      string
  title:        string
  description?: string
  status:       TaskStatus
  priority:     Priority
  due_date?:    string
  due_at?:      string
  creator_tz?:  string
  archived?:    boolean
  position:     number
  created_by:   number
  created_at:   string
  updated_at:   string
  subtasks?:    Subtask[]
}

export interface TaskHistory {
  id:         string
  task_id:    string
  user_id:    number
  field:      string
  old_value?: string | null
  new_value?: string | null
  created_at: string
  user: {
    id:         number
    first_name: string
    username?:  string | null
  }
}

export interface SharedListInvite {
  list_id:         string
  invited_user_id: number
  role:            MemberRole
}

export type CreateTaskInput = Pick<Task, 'list_id' | 'title' | 'priority'> & {
  description?: string
  due_date?:    string
}

export type UpdateTaskInput = Partial<Pick<Task,
  'title' | 'description' | 'status' | 'priority' | 'due_date' | 'position'
>>

export interface TelegramWebApp {
  initData: string
  initDataUnsafe: {
    user?:      TgUser
    hash:       string
    auth_date:  number
  }
  version:     string
  colorScheme: 'light' | 'dark'
  themeParams: Record<string, string>
  isExpanded:  boolean
  viewportHeight:       number
  viewportStableHeight: number
  MainButton: {
    text:              string
    color:             string
    textColor:         string
    isVisible:         boolean
    isActive:          boolean
    isProgressVisible: boolean
    setText(text: string): void
    onClick(fn: () => void): void
    offClick(fn: () => void): void
    show(): void
    hide(): void
    enable(): void
    disable(): void
    showProgress(leaveActive?: boolean): void
    hideProgress(): void
  }
  BackButton: {
    isVisible: boolean
    onClick(fn: () => void): void
    offClick(fn: () => void): void
    show(): void
    hide(): void
  }
  HapticFeedback: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void
    notificationOccurred(type: 'error' | 'success' | 'warning'): void
    selectionChanged(): void
  }
  CloudStorage: {
    setItem(key: string, value: string, callback?: (err: Error | null, stored: boolean) => void): void
    getItem(key: string, callback: (err: Error | null, value: string) => void): void
    getItems(keys: string[], callback: (err: Error | null, values: Record<string, string>) => void): void
    removeItem(key: string, callback?: (err: Error | null, removed: boolean) => void): void
  }
  ready(): void
  expand(): void
  close(): void
  sendData(data: string): void
  openLink(url: string, options?: { try_instant_view?: boolean }): void
  showPopup(params: { title?: string; message: string; buttons?: Array<{ id?: string; type?: string; text?: string }> }, callback?: (id: string) => void): void
  showAlert(message: string, callback?: () => void): void
  showConfirm(message: string, callback: (confirmed: boolean) => void): void
}

declare global {
  interface Window {
    Telegram: { WebApp: TelegramWebApp }
  }
}