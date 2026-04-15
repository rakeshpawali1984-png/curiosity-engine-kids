-- Add RLS policies for prompt_templates table
-- These templates are read-only system configuration used by the app

create policy "prompt_templates_select_authenticated"
on public.prompt_templates for select
using (auth.role() = 'authenticated');

-- Deny inserts from authenticated users
create policy "prompt_templates_no_insert"
on public.prompt_templates for insert
using (false)
with check (false);

-- Deny updates from authenticated users
create policy "prompt_templates_no_update"
on public.prompt_templates for update
using (false)
with check (false);

-- Deny deletes from authenticated users
create policy "prompt_templates_no_delete"
on public.prompt_templates for delete
using (false);

-- Allow service_role (backend/migrations) to manage templates
grant select, insert, update, delete on public.prompt_templates to service_role;
