-- ============================================================
-- TaskFlow TMA — Supabase Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- Users (synced from Telegram on first login)
create table if not exists users (
  id          bigint primary key,  -- Telegram user ID
  username    text,
  first_name  text not null,
  last_name   text,
  created_at  timestamptz default now()
);

-- Task Lists
create table if not exists task_lists (
  id         uuid primary key default gen_random_uuid(),
  owner_id   bigint not null references users(id) on delete cascade,
  title      text not null,
  emoji      text not null default '📋',
  color      text not null default '#7B6EF6',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- List Members (for shared lists)
create table if not exists list_members (
  list_id    uuid not null references task_lists(id) on delete cascade,
  user_id    bigint not null references users(id) on delete cascade,
  role       text not null check (role in ('owner','editor','viewer')) default 'editor',
  invited_by bigint references users(id),
  joined_at  timestamptz default now(),
  primary key (list_id, user_id)
);

-- Tasks
create table if not exists tasks (
  id          uuid primary key default gen_random_uuid(),
  list_id     uuid not null references task_lists(id) on delete cascade,
  title       text not null,
  description text,
  status      text not null check (status in ('todo','in_progress','done')) default 'todo',
  priority    text not null check (priority in ('low','medium','high','urgent')) default 'medium',
  due_date    date,
  position    int not null default 0,
  created_by  bigint not null references users(id),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Subtasks
create table if not exists subtasks (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references tasks(id) on delete cascade,
  title      text not null,
  completed  boolean not null default false,
  position   int not null default 0,
  created_at timestamptz default now()
);

-- Notification queue (for Telegram bot to process)
create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    bigint not null references users(id) on delete cascade,
  task_id    uuid references tasks(id) on delete cascade,
  type       text not null check (type in ('due_soon','overdue','shared','assigned')),
  message    text not null,
  sent       boolean default false,
  created_at timestamptz default now()
);

-- ============================================================
-- Indexes
-- ============================================================
create index if not exists tasks_list_id_idx      on tasks(list_id);
create index if not exists tasks_status_idx       on tasks(status);
create index if not exists subtasks_task_id_idx   on subtasks(task_id);
create index if not exists list_members_uid_idx   on list_members(user_id);
create index if not exists notifications_uid_idx  on notifications(user_id, sent);

-- ============================================================
-- Auto-update updated_at
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger task_lists_updated_at before update on task_lists
  for each row execute function update_updated_at();

create trigger tasks_updated_at before update on tasks
  for each row execute function update_updated_at();

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================
alter table users       enable row level security;
alter table task_lists  enable row level security;
alter table list_members enable row level security;
alter table tasks       enable row level security;
alter table subtasks    enable row level security;
alter table notifications enable row level security;

-- We use service role from API routes, so RLS is permissive
-- for anon (all auth happens server-side via initData HMAC)
create policy "service role bypass" on users         using (true) with check (true);
create policy "service role bypass" on task_lists    using (true) with check (true);
create policy "service role bypass" on list_members  using (true) with check (true);
create policy "service role bypass" on tasks         using (true) with check (true);
create policy "service role bypass" on subtasks      using (true) with check (true);
create policy "service role bypass" on notifications using (true) with check (true);

-- ============================================================
-- Realtime: enable for sync between users
-- ============================================================
alter publication supabase_realtime add table tasks;
alter publication supabase_realtime add table subtasks;
alter publication supabase_realtime add table task_lists;
