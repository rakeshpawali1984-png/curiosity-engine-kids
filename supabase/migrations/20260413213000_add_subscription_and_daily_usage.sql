alter table public.parents
  add column if not exists plan_key text not null default 'free',
  add column if not exists subscription_status text not null default 'free',
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_current_period_end timestamptz;

create unique index if not exists idx_parents_stripe_customer_id
  on public.parents(stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists idx_parents_stripe_subscription_id
  on public.parents(stripe_subscription_id)
  where stripe_subscription_id is not null;

create table if not exists public.parent_daily_question_usage (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents(id) on delete cascade,
  usage_date date not null,
  question_id text not null,
  created_at timestamptz not null default now(),
  unique (parent_id, usage_date, question_id)
);

create index if not exists idx_parent_daily_question_usage_parent_date
  on public.parent_daily_question_usage(parent_id, usage_date);

alter table public.parent_daily_question_usage enable row level security;

create policy "parent_daily_question_usage_select_own"
on public.parent_daily_question_usage for select
using (parent_id = auth.uid());

create policy "parent_daily_question_usage_insert_own"
on public.parent_daily_question_usage for insert
with check (parent_id = auth.uid());