-- Complete RLS policies for parent_access_overrides table
-- Admins/service_role modify via backend, authenticated users can only read their own

-- Deny inserts from authenticated users
create policy "parent_access_overrides_no_insert"
on public.parent_access_overrides for insert
with check (false);

-- Deny updates from authenticated users
create policy "parent_access_overrides_no_update"
on public.parent_access_overrides for update
using (false)
with check (false);

-- Deny deletes from authenticated users
create policy "parent_access_overrides_no_delete"
on public.parent_access_overrides for delete
using (false);

-- Allow service_role (backend admin operations) to manage access overrides
grant select, insert, update, delete on public.parent_access_overrides to service_role;
