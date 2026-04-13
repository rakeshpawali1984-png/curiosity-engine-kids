alter table public.parents
  add column if not exists parent_pin_hash text,
  add column if not exists parent_pin_salt text,
  add column if not exists parent_pin_set_at timestamptz;

alter table public.parents
  add constraint parents_pin_hash_with_salt
  check (
    (parent_pin_hash is null and parent_pin_salt is null)
    or
    (parent_pin_hash is not null and parent_pin_salt is not null)
  );
