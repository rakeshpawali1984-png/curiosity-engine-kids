create table if not exists public.parent_access_overrides (
  user_id uuid primary key references public.parents(id) on delete cascade,
  access_level text not null,
  expires_at timestamptz,
  reason text,
  created_by text not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint parent_access_overrides_access_level_check
    check (lower(access_level) in ('full'))
);

create index if not exists idx_parent_access_overrides_expires_at
  on public.parent_access_overrides(expires_at);

create or replace function public.set_parent_access_overrides_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_parent_access_overrides_updated_at
  on public.parent_access_overrides;

create trigger trg_parent_access_overrides_updated_at
before update on public.parent_access_overrides
for each row execute function public.set_parent_access_overrides_updated_at();

alter table public.parent_access_overrides enable row level security;

create policy "parent_access_overrides_select_own"
on public.parent_access_overrides for select
using (user_id = auth.uid());
