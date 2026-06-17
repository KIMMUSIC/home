-- Supabase schema draft for the DIY Home Dashboard MVP.
-- Run in Supabase SQL editor after creating a project, then add env vars in Vercel.

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  theme text default 'light',
  accent_color text default '#8fa48d',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id)
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  status text not null default 'active',
  progress int not null default 0,
  due_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  completed boolean not null default false,
  date date not null default current_date,
  sort_order int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  url text not null,
  category text default 'Inbox',
  pinned boolean default false,
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists kanban_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  column_name text not null default 'Backlog',
  priority text default 'medium',
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table profiles enable row level security;
alter table projects enable row level security;
alter table todos enable row level security;
alter table calendar_events enable row level security;
alter table bookmarks enable row level security;
alter table kanban_cards enable row level security;

create table if not exists dashboard_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

grant select, insert, update, delete on table dashboard_states to authenticated;

alter table dashboard_states enable row level security;

-- Per-user Atlassian Jira integration credentials.
-- The api_token is stored plaintext and protected by RLS (only the owning user can read it).
-- Future hardening: encrypt-at-rest with a server-held key.
create table if not exists integration_jira (
  user_id uuid primary key references auth.users(id) on delete cascade,
  base_url text not null,
  email text not null,
  api_token text not null,
  jql text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

grant select, insert, update, delete on table integration_jira to authenticated;

alter table integration_jira enable row level security;

create policy "profiles owner" on profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "projects owner" on projects for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "todos owner" on todos for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "events owner" on calendar_events for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "bookmarks owner" on bookmarks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "cards owner" on kanban_cards for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "dashboard states owner" on dashboard_states for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "integration jira owner" on integration_jira for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
