# Environment and Deployment Runbook

- Owner: TBD
- Last updated: 2026-04-16
- Status: active
- Related docs:
	[../SUPABASE_ENVIRONMENTS.md](../SUPABASE_ENVIRONMENTS.md),
	[../60-release/PREVIEW_RELEASE_CHECKLIST.md](../60-release/PREVIEW_RELEASE_CHECKLIST.md)

## Deployment model

1. GitHub branch push triggers Vercel preview deployment.
2. Production deploy is driven by Git integration (no manual deploy required in normal flow).
3. Recommended migration promotion path is dev -> preview -> prod.

## Environment mapping

1. Local
- app runtime: local browser + local API proxy
- db/auth target: Supabase dev project

2. Preview
- branch deployment on Vercel preview
- db/auth target: Supabase preview project

3. Production
- main deployment
- db/auth target: Supabase prod project

Known project refs from current setup:

1. dev: eeatnoicrwwdphmvvuen
2. preview: hsrlzuglddluctxbmuup
3. prod: bcjtsvfgrycjzptcncjt

## Required env keys by area

### Frontend auth keys

1. SUPABASE_URL
2. SUPABASE_PUBLISHABLE_KEY
3. VITE_AUTH_REDIRECT_URL (recommended for deterministic OAuth callbacks across preview URLs)

### Backend keys

1. OPENAI_API_KEY
2. DATABASE_URL
3. DATABASE_POOLER_URL (recommended in serverless envs)
4. OPENAI_SERVER_MODEL (server-selected model for /api/spark)

### Cache and prompt controls

1. CACHE_ENABLED
2. CACHE_READ_ENABLED
3. CACHE_ASYNC_STORE
4. CACHE_SEMANTIC_ON_PATH
5. CACHE_THRESHOLD_FAST
6. CACHE_THRESHOLD_DEEP
7. CACHE_THRESHOLD_BOUNCER
8. CACHE_TTL_FAST_HOURS
9. CACHE_TTL_DEEP_HOURS
10. CACHE_TTL_BOUNCER_HOURS
11. PROMPT_VERSION_FAST
12. PROMPT_VERSION_DEEP
13. PROMPT_VERSION_BOUNCER

### Stripe billing keys

1. STRIPE_SECRET_KEY (use a restricted key in prod — scopes: Checkout Sessions Write, Customers Write, Customer portal Write)
2. STRIPE_WEBHOOK_SECRET (signing secret from Stripe dashboard webhook endpoint — live mode)
3. STRIPE_PRICE_MONTHLY_699 (must be a `price_...` ID from live mode, NOT a `prod_...` product ID)
4. APP_BASE_URL (controls checkout success/cancel redirect — set to `https://whyroo.com` in prod)

Webhook URL: `https://whyroo.com/api/billing/webhook`

Events to subscribe in Stripe dashboard:
- checkout.session.completed
- customer.subscription.created
- customer.subscription.updated
- customer.subscription.deleted
- invoice.payment_failed

### API hardening controls

1. API_AUTH_ENABLED
2. API_RATE_LIMIT_ENABLED
3. API_RATE_LIMIT_WINDOW_MS
4. API_RATE_LIMIT_MAX_REQUESTS
5. OPENAI_ALLOWED_MODELS
6. OPENAI_MAX_REQUEST_BYTES
7. OPENAI_MAX_MESSAGE_COUNT
8. OPENAI_MAX_MESSAGE_CHARS
9. OPENAI_MAX_COMPLETION_TOKENS

## OAuth configuration runbook

### Supabase (per environment project)

1. Enable Google provider.
2. Set Site URL to stable canonical domain.
3. Configure additional redirect URLs to include:
	- preview wildcard domains
	- localhost dev domains
	- production domain(s)

### Google Cloud OAuth client

1. Authorized redirect URI should be Supabase callback URL for that environment project:
	https://<project-ref>.supabase.co/auth/v1/callback

Note:

- if redirect allowlist is wrong, OAuth may fall back to unexpected Site URL.

## Supabase migration runbook

1. Verify current link:
	read supabase/.temp/project-ref
2. Link to target project:
	supabase link --project-ref <ref> --workdir <repo-path>
3. Apply migrations:
	supabase db push --workdir <repo-path>
4. Re-link back to dev after non-dev pushes.

## Vercel env verification runbook

1. List keys:
	vercel env ls preview
2. Add or overwrite key (preview):
	vercel env add KEY preview --value "..." --yes --force
3. Confirm key appears in listing.

Branch-specific preview note:

1. If Vercel prompts for a branch scope, set the branch explicitly for targeted rollout.
2. For /api/spark model policy, ensure `OPENAI_SERVER_MODEL` is set and included in `OPENAI_ALLOWED_MODELS`.

## Stripe billing runbook

### New subscription troubleshooting

1. If checkout returns 500: check Stripe dashboard → Developers → Logs → POST /v1/checkout/sessions for exact error.
2. Common error: `resource_missing` on `customer` param — stale customer ID in DB. Run: `update public.parents set stripe_customer_id = null where stripe_customer_id = '<stale_id>';` — checkout handler will auto-recreate.
3. Common error: `No such price` — `STRIPE_PRICE_MONTHLY_699` is set to a `prod_...` product ID instead of a `price_...` price ID.
4. Period-end date missing after checkout — deploy must be on `cbf278e` or later; older deploys stored `null` on checkout.session.completed.

### Webhook verification

1. Stripe dashboard → Developers → Webhooks → click endpoint → Recent deliveries.
2. All 5 subscribed events should show green (200) responses.
3. If a delivery failed, use "Resend" to replay it — idempotent handlers will safely re-process.

## Incident handling quick notes

1. If tokens are exposed in logs or chat, revoke sessions and rotate credentials where applicable.
2. Do not commit local secret files.
3. Keep branch previews isolated from production data.

