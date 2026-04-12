# Supabase Environment Plan

This repo should use one Supabase project per deployment tier.

## Current audit

- Development Vercel env points to `curiosity-dev` (`eeatnoicrwwdphmvvuen`)
- Preview Vercel env points to `curiosity-preview` (`hsrlzuglddluctxbmuup`)
- Production Vercel env now points to `curiosity-prod` (`bcjtsvfgrycjzptcncjt`)
- The local Supabase link in this repo currently points to `curiosity-dev`

## Recommended mapping

- Local `.env.local` -> `curiosity-dev`
- Vercel development -> `curiosity-dev`
- Vercel preview -> `curiosity-preview`
- Vercel production -> `curiosity-prod`

## Why production needs its own project

- Preview traffic should not pollute production data
- Schema experiments in preview should not risk production stability
- Backups, rollback, and incident handling are cleaner with isolated data
- Cache traffic is environment-specific and should stay isolated

## Create the production project

Use the same region as dev/preview unless you have a reason to move it.

```bash
supabase projects create curiosity-prod \
  --org-id eepthcvkghudaupmxlaf \
  --region ap-northeast-2 \
  --db-password '<choose-a-strong-password>'
```

After creation, note the new project ref and the database password.

## Link this repo to a project when pushing migrations

The repo normally stays linked to dev for day-to-day work.

Link to dev:

```bash
supabase link \
  --project-ref eeatnoicrwwdphmvvuen \
  --password '<dev-db-password>' \
  --workdir /Users/rakeshpawali/Projects/Kids/Curiosity-Engine
```

Link to preview:

```bash
supabase link \
  --project-ref hsrlzuglddluctxbmuup \
  --password '<preview-db-password>' \
  --workdir /Users/rakeshpawali/Projects/Kids/Curiosity-Engine
```

Link to prod:

```bash
supabase link \
  --project-ref '<prod-project-ref>' \
  --password '<prod-db-password>' \
  --workdir /Users/rakeshpawali/Projects/Kids/Curiosity-Engine
```

## Push migrations

Run this after linking the repo to the target project:

```bash
supabase db push \
  --workdir /Users/rakeshpawali/Projects/Kids/Curiosity-Engine
```

Recommended order:

1. Push to `curiosity-dev`
2. Push to `curiosity-preview`
3. Create `curiosity-prod`
4. Link to `curiosity-prod`
5. Push migrations to `curiosity-prod`

## Vercel env checklist

Required for each environment:

- `OPENAI_API_KEY`
- `DATABASE_URL`
- `DATABASE_POOLER_URL`
- `CACHE_ENABLED`
- `CACHE_THRESHOLD_FAST`
- `CACHE_THRESHOLD_DEEP`
- `CACHE_THRESHOLD_BOUNCER`
- `CACHE_TTL_FAST_HOURS`
- `CACHE_TTL_DEEP_HOURS`
- `CACHE_TTL_BOUNCER_HOURS`
- `PROMPT_VERSION_FAST`
- `PROMPT_VERSION_DEEP`
- `PROMPT_VERSION_BOUNCER`

Use pooler URLs for serverless environments whenever possible. This repo already prefers `DATABASE_POOLER_URL` over `DATABASE_URL` at runtime.

## Sync Vercel env vars

The helper script expects full connection strings rather than project refs.

```bash
export DEV_DATABASE_URL='postgresql://postgres:<password>@db.eeatnoicrwwdphmvvuen.supabase.co:5432/postgres'
export DEV_DATABASE_POOLER_URL='postgresql://postgres.eeatnoicrwwdphmvvuen:<password>@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres'

export PREVIEW_DATABASE_URL='postgresql://postgres:<password>@db.hsrlzuglddluctxbmuup.supabase.co:5432/postgres'
export PREVIEW_DATABASE_POOLER_URL='postgresql://postgres.hsrlzuglddluctxbmuup:<password>@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres'

export PROD_DATABASE_URL='postgresql://postgres:<password>@db.<prod-project-ref>.supabase.co:5432/postgres'
export PROD_DATABASE_POOLER_URL='postgresql://postgres.<prod-project-ref>:<password>@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres'

bash ./vercel-env-setup.sh
```

## Known issues already identified

- `vercel-env-setup.sh` previously implied preview used dev; that was incorrect and has been fixed
- Preview previously had no `DATABASE_POOLER_URL`; this has now been fixed
- Production Vercel env is now wired to `curiosity-prod`; redeploy production after env changes whenever you update database wiring