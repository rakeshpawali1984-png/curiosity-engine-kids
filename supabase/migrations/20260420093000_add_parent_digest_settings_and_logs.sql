alter table public.parents
  add column if not exists daily_digest_enabled boolean not null default false,
  add column if not exists daily_digest_time text not null default '18:30',
  add column if not exists daily_digest_timezone text not null default 'Australia/Sydney',
  add column if not exists daily_digest_last_sent_local_date date;

create table if not exists public.parent_daily_digest_logs (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents(id) on delete cascade,
  local_date date not null,
  timezone text not null,
  searches_count integer not null default 0,
  status text not null default 'sent',
  error_message text,
  sent_at timestamptz not null default now()
);

create index if not exists idx_parent_daily_digest_logs_parent_date
  on public.parent_daily_digest_logs(parent_id, local_date desc);

create unique index if not exists ux_parent_daily_digest_logs_parent_local_date
  on public.parent_daily_digest_logs(parent_id, local_date);
