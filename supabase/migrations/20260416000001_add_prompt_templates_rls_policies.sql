-- Add RLS policies for prompt_templates table
-- These templates are read-only system configuration used by the app

create policy "prompt_templates_select_authenticated"
on public.prompt_templates for select
using (auth.role() = 'authenticated');

-- Deny inserts, updates, deletes from authenticated users (backend/admin only)
create policy "prompt_templates_no_user_write"
on public.prompt_templates for insert, update, delete
using (false)
with check (false);

-- Allow service_role (backend/migrations) to manage templates
grant select, insert, update, delete on public.prompt_templates to service_role;
