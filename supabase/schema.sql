-- ============================================================
-- 旅途英語 · Supabase schema  (在 Supabase → SQL Editor 貼上整份執行一次)
-- ============================================================

-- 管理員 email（後台只有這個帳號能看所有人的資料）
create or replace function public.is_admin() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'rickhuang1222@icloud.com';
$$;

-- 使用者檔案
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  level text,
  dest_name text,
  xp int default 0,
  streak int default 0,
  lessons_done int default 0,
  days_done int default 0,
  retention real,
  created_at timestamptz default now(),
  last_active timestamptz default now()
);

-- 完整學習狀態（每位使用者一筆 JSON）
create table if not exists public.progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz default now()
);

-- 每一題作答事件（後台分析用）
create table if not exists public.events (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete cascade,
  ts timestamptz not null,
  item_id text,
  ok boolean,
  kind text,
  ms int,
  ctx text,
  created_at timestamptz default now()
);
create index if not exists events_user_ts on public.events(user_id, ts desc);
create index if not exists events_ts on public.events(ts desc);

-- Row Level Security：使用者只能看自己的；管理員看全部
alter table public.profiles enable row level security;
alter table public.progress enable row level security;
alter table public.events enable row level security;

drop policy if exists "profiles self" on public.profiles;
create policy "profiles self" on public.profiles for all
  using (auth.uid() = id or public.is_admin()) with check (auth.uid() = id);

drop policy if exists "progress self" on public.progress;
create policy "progress self" on public.progress for all
  using (auth.uid() = user_id or public.is_admin()) with check (auth.uid() = user_id);

drop policy if exists "events self" on public.events;
create policy "events self" on public.events for all
  using (auth.uid() = user_id or public.is_admin()) with check (auth.uid() = user_id);

-- 後台彙總：每日活躍與作答
create or replace view public.admin_daily with (security_invoker = true) as
  select date_trunc('day', ts)::date as day,
         count(distinct user_id) as active_users,
         count(*) as answers,
         avg(case when ok then 1 else 0 end)::real as accuracy,
         avg(ms)::int as avg_ms
  from public.events
  group by 1 order by 1 desc;

-- 後台彙總：最常錯的字（全體）
create or replace view public.admin_hard_items with (security_invoker = true) as
  select item_id, count(*) as n, avg(case when ok then 1 else 0 end)::real as accuracy
  from public.events
  where ctx in ('review','new','dest')
  group by 1 having count(*) >= 5
  order by accuracy asc, n desc limit 50;

grant select on public.admin_daily, public.admin_hard_items to authenticated;
