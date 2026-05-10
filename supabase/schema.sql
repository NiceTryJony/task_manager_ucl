-- ============================================================
-- TaskFlow TMA — Supabase Schema (актуальная версия)
-- Синхронизировано с реальной БД
-- ============================================================

-- ============================================================
-- ТАБЛИЦЫ
-- ============================================================

-- Users
create table if not exists users (
  id          bigint primary key,
  username    text unique,
  first_name  text not null,
  last_name   text,
  pin_hash    text,                          -- ← добавлено (v2)
  created_at  timestamptz not null default now()
);

-- Task Lists
create table if not exists task_lists (
  id         uuid primary key default gen_random_uuid(),
  owner_id   bigint not null references users(id) on delete cascade,
  title      text not null check (char_length(title) >= 1 and char_length(title) <= 100),
  emoji      text not null default '📋',
  color      text not null default '#7B6EF6',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- List Members
create table if not exists list_members (
  list_id    uuid not null references task_lists(id) on delete cascade,
  user_id    bigint not null references users(id) on delete cascade,
  role       text not null check (role in ('owner','editor','viewer')) default 'editor',
  invited_by bigint references users(id) on delete set null,   -- ← было без on delete
  joined_at  timestamptz not null default now(),
  primary key (list_id, user_id)
);

-- Tasks
create table if not exists tasks (
  id          uuid primary key default gen_random_uuid(),
  list_id     uuid not null references task_lists(id) on delete cascade,
  created_by  bigint references users(id) on delete set null,  -- ← было not null без on delete
  title       text not null check (char_length(title) >= 1 and char_length(title) <= 200),
  description text check (char_length(description) <= 2000),
  status      text not null check (status in ('todo','in_progress','done')) default 'todo',
  priority    text not null check (priority in ('low','medium','high','urgent')) default 'medium',
  due_date    date,
  due_at      timestamptz,                   -- ← добавлено (v2)
  creator_tz  text not null default 'UTC',   -- ← добавлено (v2)
  archived    boolean not null default false, -- ← добавлено (v2)
  assigned_to bigint references users(id) on delete set null,  -- ← добавлено (v2)
  position    int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Subtasks
create table if not exists subtasks (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references tasks(id) on delete cascade,
  created_by bigint references users(id) on delete set null,   -- ← было без on delete
  title      text not null check (char_length(title) >= 1 and char_length(title) <= 300),
  completed  boolean not null default false,
  position   int not null default 0,
  created_at timestamptz not null default now()
);

-- Notifications
create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    bigint not null references users(id) on delete cascade,
  task_id    uuid references tasks(id) on delete cascade,
  type       text not null check (type in ('due_soon','overdue','shared','assigned','mention')),
  message    text not null check (char_length(message) >= 1 and char_length(message) <= 1000),
  sent       boolean not null default false,
  created_at timestamptz not null default now()
);

-- Task History                              -- ← новая таблица (v2)
create table if not exists task_history (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references tasks(id) on delete cascade,
  user_id     bigint references users(id) on delete cascade,   -- ← было без on delete
  action_type text not null default 'field_change' check (action_type in (
    'field_change',
    'task_created',
    'subtask_added',
    'subtask_deleted',
    'subtask_toggled',
    'subtask_renamed',
    'subtask_reordered'
  )),
  field       text,
  old_value   text,
  new_value   text,
  meta        jsonb,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- ИНДЕКСЫ
-- ============================================================

create index if not exists tasks_list_id_idx       on tasks(list_id);
create index if not exists tasks_status_idx        on tasks(status);
create index if not exists tasks_archived_idx      on tasks(list_id, archived);
create index if not exists subtasks_task_id_idx    on subtasks(task_id);
create index if not exists list_members_uid_idx    on list_members(user_id);
create index if not exists notifications_uid_idx   on notifications(user_id, sent);

-- Индексы для task_history (критично для производительности)
create index if not exists task_history_task_id_idx    on task_history(task_id);
create index if not exists task_history_task_date_idx  on task_history(task_id, created_at desc);

-- Частичный индекс для очереди уведомлений (cron-job)
create index if not exists notifications_unsent_idx
  on notifications(user_id, created_at)
  where sent = false;

-- ============================================================
-- ТРИГГЕРЫ updated_at
-- ============================================================

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists task_lists_updated_at on task_lists;
create trigger task_lists_updated_at
  before update on task_lists
  for each row execute function update_updated_at();

drop trigger if exists tasks_updated_at on tasks;
create trigger tasks_updated_at
  before update on tasks
  for each row execute function update_updated_at();

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================

alter table users         enable row level security;
alter table task_lists    enable row level security;
alter table list_members  enable row level security;
alter table tasks         enable row level security;
alter table subtasks      enable row level security;
alter table notifications enable row level security;
alter table task_history  enable row level security;

-- Сервисный клиент обходит RLS — вся авторизация на уровне API routes
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'users' and policyname = 'service role bypass'
  ) then
    create policy "service role bypass" on users         using (true) with check (true);
    create policy "service role bypass" on task_lists    using (true) with check (true);
    create policy "service role bypass" on list_members  using (true) with check (true);
    create policy "service role bypass" on tasks         using (true) with check (true);
    create policy "service role bypass" on subtasks      using (true) with check (true);
    create policy "service role bypass" on notifications using (true) with check (true);
    create policy "service role bypass" on task_history  using (true) with check (true);
  end if;
end $$;

-- ============================================================
-- REALTIME
-- ============================================================

alter publication supabase_realtime add table tasks;
alter publication supabase_realtime add table subtasks;
alter publication supabase_realtime add table task_lists;

-- ============================================================
-- МИГРАЦИЯ для существующей БД
-- Запустить один раз в Supabase SQL Editor если БД уже создана
-- ============================================================

-- tasks.created_by: снять NOT NULL, добавить ON DELETE SET NULL
alter table tasks alter column created_by drop not null;
alter table tasks drop constraint if exists tasks_created_by_fkey;
alter table tasks add constraint tasks_created_by_fkey
  foreign key (created_by) references users(id) on delete set null;

-- tasks.assigned_to: добавить ON DELETE SET NULL
alter table tasks drop constraint if exists tasks_assigned_to_fkey;
alter table tasks add constraint tasks_assigned_to_fkey
  foreign key (assigned_to) references users(id) on delete set null;

-- subtasks.created_by: добавить ON DELETE SET NULL
alter table subtasks drop constraint if exists subtasks_created_by_fkey;
alter table subtasks add constraint subtasks_created_by_fkey
  foreign key (created_by) references users(id) on delete set null;

-- task_history.user_id: добавить ON DELETE CASCADE
alter table task_history drop constraint if exists task_history_user_id_fkey;
alter table task_history add constraint task_history_user_id_fkey
  foreign key (user_id) references users(id) on delete cascade;

-- list_members.invited_by: добавить ON DELETE SET NULL
alter table list_members drop constraint if exists list_members_invited_by_fkey;
alter table list_members add constraint list_members_invited_by_fkey
  foreign key (invited_by) references users(id) on delete set null;