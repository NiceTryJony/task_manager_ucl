<div align="center">

<img src="https://via.placeholder.com/120x120/8173F5/FFFFFF?text=TF" width="96" height="96" style="border-radius: 24px" />

# TaskFlow

**Production-grade Task Manager built as a Telegram Mini App**

[![Live App](https://img.shields.io/badge/Open%20in%20Telegram-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/ucl_maanger_bot/app)
[![Vercel](https://img.shields.io/badge/Deployed%20on%20Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://task-manager-ucl.vercel.app)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js 14](https://img.shields.io/badge/Next.js%2014-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com)

</div>

---

## Overview

TaskFlow is a full-featured collaborative task manager designed to run natively inside Telegram as a Mini App. It combines a polished glassmorphism UI with real-time sync, multi-user collaboration, drag-and-drop reordering, subtasks, assignees, due dates, and a Telegram Bot notification system — all backed by a PostgreSQL database and deployed on Vercel.

---

## Features

**Task Management**
- Create, edit, delete tasks with titles, descriptions, priorities, and due dates
- Subtasks (checklist) with drag-to-reorder support
- Four priority levels: Low · Medium · High · Urgent
- Due date & time with dual-timezone display (creator tz vs viewer tz)
- Archive system — separate from delete, recoverable
- Swipe gestures: right to complete, left to archive

**Collaboration**
- Shared task lists — invite members by username
- Three permission roles: Owner · Editor · Viewer
- Multi-assignee support per task
- @mention system in task descriptions with notifications
- Real-time sync via Supabase Realtime channels

**Notifications (via Telegram Bot)**
- Due-soon reminders (24h before deadline)
- Overdue task alerts
- Assignment notifications
- @mention notifications
- Cron-based delivery every 5 minutes via GitHub Actions

**UI & UX**
- Glassmorphism design system with dark and light themes
- GSAP-powered animations (page transitions, sheet entrances, confetti)
- dnd-kit drag-and-drop with touch support
- Pull-to-refresh
- Global full-text search across all lists and subtasks
- Export to Text / Markdown / CSV / JSON
- Telegram Haptic Feedback on every interaction
- Onboarding tour (Driver.js)

**Auth**
- PIN-protected accounts (SHA-256 hashed, server-side)
- Telegram `initData` HMAC-SHA256 verification
- Fallback username/PIN auth for browser usage

---

## Tech Stack

| Layer              | Technology                                      |
|--------------------|-------------------------------------------------|
| Framework          | Next.js 14 (App Router, Edge-compatible)        |
| Language           | TypeScript (strict)                             |
| Styling            | Tailwind CSS + custom CSS design tokens         |
| Animations         | GSAP 3                                          |
| Drag & Drop        | dnd-kit                                         |
| State              | Zustand                                         |
| Database           | Supabase — PostgreSQL + Realtime                |
| Auth               | Telegram initData · HMAC-SHA256 · PIN/SHA-256   |
| Notifications      | Telegram Bot API + GitHub Actions cron          |
| Hosting            | Vercel (serverless)                             |
| CI/CD              | GitHub Actions                                  |

---

## Project Structure

```
taskflow/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/route.ts              # Telegram HMAC verification
│   │   │   ├── lists/
│   │   │   │   ├── route.ts               # Lists CRUD
│   │   │   │   └── share/route.ts         # Member management
│   │   │   ├── tasks/
│   │   │   │   ├── route.ts               # Tasks CRUD + assignees
│   │   │   │   ├── subtasks/route.ts      # Subtasks CRUD
│   │   │   │   └── history/route.ts       # Task edit history
│   │   │   ├── users/
│   │   │   │   ├── identify/route.ts      # Register / login with PIN
│   │   │   │   └── search/route.ts        # Username search
│   │   │   ├── search/route.ts            # Global full-text search
│   │   │   ├── export/route.ts            # Export (text/md/csv/json)
│   │   │   └── cron/notify/route.ts       # Notification delivery
│   │   ├── page.tsx                       # Home — list dashboard
│   │   ├── layout.tsx
│   │   └── globals.css                    # Design tokens + animations
│   ├── components/
│   │   ├── ListDetailView.tsx             # Main task view + DnD
│   │   ├── TaskSheet.tsx                  # Create / edit task sheet
│   │   ├── ViewerTaskSheet.tsx            # Read-only task view
│   │   ├── TaskHistoryPanel.tsx           # Edit history timeline
│   │   ├── ShareSheet.tsx                 # Collaboration + export
│   │   ├── GlobalSearchSheet.tsx          # Cross-list search
│   │   ├── AssigneePicker.tsx             # Multi-assignee selector
│   │   ├── TaskAssigneesBadge.tsx         # Assignee avatar stack
│   │   ├── SwipeableTaskCard.tsx          # Swipe gesture wrapper
│   │   ├── ListCard.tsx                   # List summary card
│   │   ├── ContextMenu.tsx                # Long-press context menu
│   │   ├── Confetti.tsx                   # Completion celebration
│   │   ├── UsernameModal.tsx              # Auth flow
│   │   ├── SettingsSheet.tsx              # Profile + PIN settings
│   │   ├── CreateListSheet.tsx
│   │   └── ExportPanel.tsx
│   ├── hooks/
│   │   ├── useTelegram.ts                 # Telegram WebApp SDK
│   │   └── usePending.ts                  # Optimistic update tracker
│   ├── lib/
│   │   ├── supabase.ts                    # Client + service clients
│   │   ├── store.ts                       # Zustand global store
│   │   ├── utils.ts                       # Helpers, config constants
│   │   ├── i18n.ts                        # EN / UK translations
│   │   ├── i18n-context.tsx
│   │   └── theme-context.tsx
│   └── types/index.ts
├── supabase/
│   └── schema.sql                         # Full DB schema + migrations
├── .github/
│   └── workflows/notify.yml               # Notification cron (every 5min)
└── vercel.json
```

---

## Database Schema

```
users              — id (bigint PK), username, first_name, pin_hash
task_lists         — id (uuid), owner_id, title, emoji, color
list_members       — list_id + user_id (PK), role (owner|editor|viewer)
tasks              — id (uuid), list_id, title, description, status,
                     priority, due_at, creator_tz, archived, position
subtasks           — id (uuid), task_id, title, completed, position
task_assignees     — task_id + user_id, assigned_by
task_history       — task_id, user_id, action_type, field, old_value, new_value, meta
notifications      — user_id, task_id, type, message, sent
```

Realtime subscriptions are enabled on `tasks`, `subtasks`, and `task_lists`.

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- A Telegram Bot token from [@BotFather](https://t.me/BotFather)

### 1. Clone & Install

```bash
git clone https://github.com/your-org/taskflow-tma.git
cd taskflow-tma
npm install
```

### 2. Environment Variables

```bash
cp .env.local.example .env.local
```

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Telegram
BOT_TOKEN=123456789:ABC...

# Auth
PIN_SALT=your-random-salt-string

# Cron (any random secret)
CRON_SECRET=your-cron-secret

# App
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

### 3. Database Setup

Open the Supabase SQL Editor and run the full migration:

```bash
# Copy contents of supabase/schema.sql and execute in Supabase SQL Editor
```

The schema creates all tables, indexes, RLS policies, triggers, and Realtime subscriptions in one pass.

### 4. Run Locally

```bash
npm run dev
# → http://localhost:3000
```

In development, Telegram auth is bypassed and a mock user session is used automatically.

---

## Deployment

### Vercel (Recommended)

```bash
npm install -g vercel
vercel deploy --prod
```

Or connect your GitHub repository to [vercel.com](https://vercel.com) for automatic deployments on every push to `main`.

**Add all environment variables** from the list above in the Vercel project settings under **Settings → Environment Variables**.

### Register the Mini App with BotFather

```
1. Open @BotFather in Telegram
2. Send /newapp
3. Select your bot
4. Name: TaskFlow
5. Short description: Smart task manager
6. Photo: upload an icon
7. Web App URL: https://your-app.vercel.app
```

Users open the app at: `t.me/YOUR_BOT/app`

---

## Notifications

Notifications are delivered by a cron job that calls `GET /api/cron/notify` every 5 minutes.

**On Vercel**, add this to `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/notify", "schedule": "*/5 * * * *" }
  ]
}
```

**On GitHub Actions** (already included in `.github/workflows/notify.yml`):

```yaml
on:
  schedule:
    - cron: '*/5 * * * *'
```

Set two repository secrets: `APP_URL` (your Vercel domain) and `CRON_SECRET`.

The cron endpoint:
1. Queues `due_soon` notifications for tasks due within 24 hours
2. Queues `overdue` notifications for past-due tasks
3. Delivers all pending notifications via `sendMessage` to the Telegram Bot API
4. Marks each notification as `sent = true` after delivery

---

## Security

| Concern                  | Approach                                                                 |
|--------------------------|--------------------------------------------------------------------------|
| Telegram auth            | `initData` verified with HMAC-SHA256 against `BOT_TOKEN` server-side    |
| Session validity         | `auth_date` checked — rejects tokens older than 1 hour                  |
| PIN storage              | SHA-256 with per-instance salt, never stored in plaintext               |
| Data access              | All mutations go through API routes using the Supabase service client   |
| Role enforcement         | Every route checks `list_members.role` before allowing writes           |
| RLS                      | Enabled on all tables — service role bypasses for API routes only       |
| Viewer restrictions      | Viewers can only toggle subtask completion — all other writes rejected  |

---

## API Reference

| Method   | Endpoint                        | Description                        |
|----------|---------------------------------|------------------------------------|
| `GET`    | `/api/lists?userId=`            | Get all lists for a user           |
| `POST`   | `/api/lists`                    | Create a list                      |
| `PATCH`  | `/api/lists`                    | Update list metadata               |
| `DELETE` | `/api/lists?listId=&userId=`    | Delete a list (owner only)         |
| `GET`    | `/api/lists/share?listId=&userId=` | Get list members               |
| `POST`   | `/api/lists/share`              | Invite a member                    |
| `PATCH`  | `/api/lists/share`              | Change member role                 |
| `DELETE` | `/api/lists/share?...`          | Remove a member                    |
| `GET`    | `/api/tasks?listId=&userId=`    | Get tasks for a list               |
| `POST`   | `/api/tasks`                    | Create a task                      |
| `PATCH`  | `/api/tasks`                    | Update a task                      |
| `DELETE` | `/api/tasks?taskId=&userId=`    | Delete a task                      |
| `POST`   | `/api/tasks/subtasks`           | Create a subtask                   |
| `PATCH`  | `/api/tasks/subtasks`           | Update a subtask                   |
| `DELETE` | `/api/tasks/subtasks?...`       | Delete a subtask                   |
| `GET`    | `/api/tasks/history?taskId=`    | Get task edit history              |
| `GET`    | `/api/users/identify` (POST)    | Register or login with PIN         |
| `GET`    | `/api/users/search?q=`          | Search users by username           |
| `GET`    | `/api/search?q=&userId=`        | Global full-text task search       |
| `GET`    | `/api/export?listId=&format=`   | Export list (text/markdown/csv/json)|
| `GET`    | `/api/cron/notify`              | Process and deliver notifications  |

---

## Internationalization

The app ships with full translations for **English** and **Ukrainian**. Language preference is stored in `localStorage` and switchable from the Settings sheet.

All translation keys are typed — `TranslationKey` in `src/lib/i18n.ts` will cause a TypeScript error if a key is missing in either locale.

---

## License

MIT — see [LICENSE](./LICENSE)

---

<div align="center">

Built for Telegram Mini Apps · Powered by Next.js & Supabase

</div>
