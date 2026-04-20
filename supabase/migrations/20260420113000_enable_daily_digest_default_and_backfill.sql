alter table public.parents
  alter column daily_digest_enabled set default true,
  alter column daily_digest_time set default '18:30';

update public.parents
set
  daily_digest_enabled = true,
  daily_digest_time = '18:30'
where
  daily_digest_enabled is distinct from true
  or daily_digest_time is distinct from '18:30';
