-- CRITICAL SECURITY FIX: Enable RLS on curiosity_cache table
-- This table was publicly accessible (anyone could read/edit/delete all data)
-- Solution: Enable RLS and restrict to service_role only (backend API use only)

-- Enable RLS on curiosity_cache
alter table public.curiosity_cache enable row level security;

-- Policy: Only service_role (backend API) can access
-- Authenticated users (app users) cannot bypass this with the policy above
create policy "curiosity_cache_service_role_only"
on public.curiosity_cache
for all
using (false)  -- Deny all by default for authenticated users
with check (false);

-- Grant explicit access to service_role
-- This allows the backend API to read/write cache records
alter table public.curiosity_cache owner to postgres;
grant all on public.curiosity_cache to service_role;
