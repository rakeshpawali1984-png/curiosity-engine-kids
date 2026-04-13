-- Parent auth + child profiles model (local/dev first)
-- Decisions locked:
-- 1) Max child profiles per parent = 3
-- 2) Deleting a child profile is hard delete
-- 3) Deleting search history does NOT remove badges

create extension if not exists pgcrypto;

create table if not exists public.parents (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.child_profiles (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents(id) on delete cascade,
  name text not null,
  avatar_emoji text not null default '🧠',
  age_range text not null default '6-8',
  created_at timestamptz not null default now(),
  constraint child_profiles_name_not_blank check (char_length(trim(name)) > 0)
);

create table if not exists public.child_searches (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.child_profiles(id) on delete cascade,
  query_text text not null,
  search_type text not null default 'curious',
  response_summary jsonb,
  created_at timestamptz not null default now(),
  constraint child_searches_query_not_blank check (char_length(trim(query_text)) > 0)
);

create table if not exists public.child_badges (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.child_profiles(id) on delete cascade,
  badge_key text not null,
  badge_title text not null,
  source_search_id uuid references public.child_searches(id) on delete set null,
  awarded_at timestamptz not null default now(),
  constraint child_badges_key_not_blank check (char_length(trim(badge_key)) > 0),
  constraint child_badges_title_not_blank check (char_length(trim(badge_title)) > 0),
  unique (child_id, badge_key)
);

create index if not exists idx_child_profiles_parent_id on public.child_profiles(parent_id);
create index if not exists idx_child_searches_child_id on public.child_searches(child_id);
create index if not exists idx_child_searches_created_at on public.child_searches(created_at desc);
create index if not exists idx_child_badges_child_id on public.child_badges(child_id);

create or replace function public.enforce_max_three_children()
returns trigger
language plpgsql
as $$
declare
  child_count integer;
begin
  select count(*) into child_count
  from public.child_profiles
  where parent_id = new.parent_id;

  if child_count >= 3 then
    raise exception 'Max 3 child profiles allowed per parent'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_max_three_children on public.child_profiles;
create trigger trg_enforce_max_three_children
before insert on public.child_profiles
for each row execute function public.enforce_max_three_children();

alter table public.parents enable row level security;
alter table public.child_profiles enable row level security;
alter table public.child_searches enable row level security;
alter table public.child_badges enable row level security;

-- parents policies
create policy "parents_select_own"
on public.parents for select
using (id = auth.uid());

create policy "parents_insert_own"
on public.parents for insert
with check (id = auth.uid());

create policy "parents_update_own"
on public.parents for update
using (id = auth.uid())
with check (id = auth.uid());

-- child_profiles policies
create policy "child_profiles_select_own"
on public.child_profiles for select
using (parent_id = auth.uid());

create policy "child_profiles_insert_own"
on public.child_profiles for insert
with check (parent_id = auth.uid());

create policy "child_profiles_update_own"
on public.child_profiles for update
using (parent_id = auth.uid())
with check (parent_id = auth.uid());

create policy "child_profiles_delete_own"
on public.child_profiles for delete
using (parent_id = auth.uid());

-- child_searches policies
create policy "child_searches_select_own"
on public.child_searches for select
using (
  exists (
    select 1
    from public.child_profiles cp
    where cp.id = child_searches.child_id
      and cp.parent_id = auth.uid()
  )
);

create policy "child_searches_insert_own"
on public.child_searches for insert
with check (
  exists (
    select 1
    from public.child_profiles cp
    where cp.id = child_searches.child_id
      and cp.parent_id = auth.uid()
  )
);

create policy "child_searches_delete_own"
on public.child_searches for delete
using (
  exists (
    select 1
    from public.child_profiles cp
    where cp.id = child_searches.child_id
      and cp.parent_id = auth.uid()
  )
);

-- child_badges policies
create policy "child_badges_select_own"
on public.child_badges for select
using (
  exists (
    select 1
    from public.child_profiles cp
    where cp.id = child_badges.child_id
      and cp.parent_id = auth.uid()
  )
);

create policy "child_badges_insert_own"
on public.child_badges for insert
with check (
  exists (
    select 1
    from public.child_profiles cp
    where cp.id = child_badges.child_id
      and cp.parent_id = auth.uid()
  )
);

create policy "child_badges_update_own"
on public.child_badges for update
using (
  exists (
    select 1
    from public.child_profiles cp
    where cp.id = child_badges.child_id
      and cp.parent_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.child_profiles cp
    where cp.id = child_badges.child_id
      and cp.parent_id = auth.uid()
  )
);

create policy "child_badges_delete_own"
on public.child_badges for delete
using (
  exists (
    select 1
    from public.child_profiles cp
    where cp.id = child_badges.child_id
      and cp.parent_id = auth.uid()
  )
);
