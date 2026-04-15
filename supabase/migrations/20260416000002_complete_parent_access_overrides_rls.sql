-- Complete RLS policies for parent_access_overrides table
-- Admins/service_role modify via backend, authenticated users can only read their own

create policy "parent_access_overrides_no_user_write"
on public.parent_access_overrides for insert, update, delete
using (false)
with check (false);

-- Allow service_role (backend admin operations) to manage access overrides
grant select, insert, update, delete on public.parent_access_overrides to service_role;
