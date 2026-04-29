alter table public.child_profiles
add column if not exists interests text[] not null default '{}'::text[];

alter table public.child_profiles
drop constraint if exists child_profiles_interests_max_5;

alter table public.child_profiles
add constraint child_profiles_interests_max_5
check (coalesce(array_length(interests, 1), 0) <= 5);
