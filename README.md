# TaskFlow TMA

A production-grade Task Manager as a Telegram Mini App.
Built with Next.js 14, Supabase, GSAP, dnd-kit, and Zustand.

---

## Stack

| Layer       | Technology                        |
|-------------|-----------------------------------|
| Framework   | Next.js 14 (App Router)           |
| Styling     | Tailwind CSS + custom design system |
| Animations  | GSAP 3                            |
| Drag & Drop | dnd-kit                           |
| State       | Zustand                           |
| Database    | Supabase (PostgreSQL + Realtime)  |
| Auth        | Telegram initData HMAC-SHA256     |
| Hosting     | Vercel (free tier)                |

---

## Features

- ✅ Create, edit, delete tasks
- ✅ Subtasks (checklist inside task)
- ✅ Priority levels: Low / Medium / High / Urgent
- ✅ Due dates with urgency highlighting
- ✅ Drag-to-reorder tasks
- ✅ Filter by status (All / To Do / Doing / Done)
- ✅ Shared lists — invite users by Telegram ID
- ✅ Real-time sync via Supabase Realtime
- ✅ Export list to text (clipboard or native share)
- ✅ Telegram haptic feedback
- ✅ Dark theme synced with Telegram
- ✅ Notification queue for bot

---

## Setup

### 1. Supabase

1. Go to [supabase.com](https://supabase.com) → New project
2. Open **SQL Editor** and run `supabase/schema.sql`
3. Copy **Project URL** and **anon key** from Project Settings → API
4. Copy **service_role key** (keep secret!)

### 2. Telegram Bot

1. Message [@BotFather](https://t.me/BotFather) → `/newbot`
2. Copy the **BOT_TOKEN**
3. After deploy: send `/newapp` to BotFather → set your Vercel URL

### 3. Local Development

```bash
cp .env.local.example .env.local
# Fill in your values

npm install
npm run dev
# Open http://localhost:3000
```

> In development, Telegram auth is bypassed automatically (mock user ID 123456789)

### 4. Deploy to Vercel

```bash
npm install -g vercel
vercel deploy
```

Or connect your GitHub repo to [vercel.com](https://vercel.com) for automatic deploys.

**Add environment variables in Vercel:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `BOT_TOKEN`
- `NEXT_PUBLIC_APP_URL` (your vercel domain)

### 5. Register Mini App with BotFather

```
/newapp → choose your bot → set name "TaskFlow"
→ set URL: https://your-app.vercel.app
→ Done!
```

Users open it via: `t.me/YOUR_BOT/taskflow`

---

## Notifications (Optional Bot)

The `notifications` table queues messages for unsent delivery.
Run a simple polling script or cron job:

```typescript
// bot/notify.ts — run every minute
import { createServiceClient } from '../src/lib/supabase'
import TelegramBot from 'node-telegram-bot-api'

const bot = new TelegramBot(process.env.BOT_TOKEN!)
const db  = createServiceClient()

const { data: pending } = await db
  .from('notifications')
  .select('*')
  .eq('sent', false)
  .limit(50)

for (const notif of pending ?? []) {
  await bot.sendMessage(notif.user_id, notif.message)
  await db.from('notifications').update({ sent: true }).eq('id', notif.id)
}
```

Deploy this as a Vercel Cron Job (free):
```json
// vercel.json
{
  "crons": [{ "path": "/api/cron/notify", "schedule": "* * * * *" }]
}
```

---

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── auth/route.ts          ← Telegram HMAC verification
│   │   ├── lists/
│   │   │   ├── route.ts           ← Lists CRUD
│   │   │   └── share/route.ts     ← Invite members
│   │   ├── tasks/
│   │   │   ├── route.ts           ← Tasks CRUD
│   │   │   └── subtasks/route.ts  ← Subtasks CRUD
│   │   └── export/route.ts        ← Text export
│   ├── layout.tsx
│   ├── page.tsx                   ← Home / dashboard
│   └── globals.css
├── components/
│   ├── ListCard.tsx
│   ├── ListDetailView.tsx         ← Main task view with DnD
│   ├── CreateListSheet.tsx
│   ├── TaskSheet.tsx              ← Create/edit + subtasks
│   ├── ShareSheet.tsx
│   └── ui/Skeleton.tsx
├── hooks/
│   └── useTelegram.ts             ← Telegram WebApp SDK hook
├── lib/
│   ├── supabase.ts
│   ├── store.ts                   ← Zustand state
│   └── utils.ts
└── types/index.ts
```

---

## Security

- All mutations go through API routes (not direct Supabase from client)
- Telegram `initData` is verified server-side with HMAC-SHA256
- Row-level access enforced in every API route (not RLS — service role)
- Auth date checked (max 1 hour validity)




























# TaskFlow TMA

**Modern Task Manager as a Telegram Mini App**

A fast, beautiful and powerful task management application built for Telegram.

![Demo](https://via.placeholder.com/800x420/1a1a2e/00ffaa?text=TaskFlow+Demo)

[![Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=flat&logo=vercel&logoColor=white)](https://task-manager-ucl.vercel.app)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)

## ✨ Features

- Full CRUD for tasks and subtasks (checklists)
- Priority levels: Low, Medium, High, **Urgent**
- Due dates with automatic color-coded urgency indicators
- Smooth Drag & Drop sorting (dnd-kit + GSAP animations)
- Smart filters (All / To Do / Doing / Done)
- Shared task lists — invite members via Telegram
- Real-time synchronization with Supabase Realtime
- Export lists as formatted text with native sharing
- Telegram Haptic Feedback support
- Dark theme that follows Telegram settings
- Notification queue via Telegram Bot

## 🛠 Tech Stack

| Layer                | Technology                          |
|----------------------|-------------------------------------|
| **Framework**        | Next.js 14 (App Router)            |
| **Language**         | TypeScript                         |
| **Styling**          | Tailwind CSS + Custom Design System|
| **Animations**       | GSAP 3                             |
| **Drag & Drop**      | dnd-kit                            |
| **State Management** | Zustand                            |
| **Database**         | Supabase (PostgreSQL + Realtime)   |
| **Auth**             | Telegram `initData` + HMAC-SHA256  |
| **Hosting**          | Vercel                             |

## 🚀 Quick Start

### 1. Environment Setup

```bash
cp .env.local.example .env.local
Fill the variables in .env.local:
envNEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
BOT_TOKEN=
NEXT_PUBLIC_APP_URL=
```
2. Database Setup

Create a new project on Supabase
Run the SQL migration: supabase/schema.sql
Enable necessary extensions (if needed)

3. Local Development
Bashnpm install
npm run dev
Development mode uses mocked Telegram authentication for easier testing.
4. Deployment
Bashvercel deploy
After deployment, register your Mini App in BotFather using /newapp.
📁 Project Structure
Bashsrc/
├── app/
│   ├── api/                 # Server API routes
│   ├── page.tsx
│   └── layout.tsx
├── components/              # UI Components
├── hooks/
├── lib/
│   ├── supabase.ts
│   ├── store.ts             # Zustand store
│   └── utils.ts
├── types/
└── supabase/
    └── schema.sql
🔐 Security

All data mutations are handled through protected API routes
Telegram initData is validated server-side with HMAC-SHA256
Session expiration is handled
Row Level Security is enforced

📸 Screenshots

🚧 Roadmap

 Push notifications via Telegram Bot
 Recurring tasks
 Labels and tags
 Full-text search
 Statistics and analytics
 Customization options

🤝 Contributing
Contributions, issues, and feature requests are welcome!
Feel free to check the issues page.
License
MIT License

Built with ❤️ for Telegram Mini Apps
Open App →
