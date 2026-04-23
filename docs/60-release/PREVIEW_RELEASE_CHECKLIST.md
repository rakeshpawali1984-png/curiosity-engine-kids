# Preview Release Checklist

- Owner: TBD
- Last updated: 2026-04-23
- Status: active
- Related docs:
	[../50-ops/ENV_AND_DEPLOYMENT_RUNBOOK.md](../50-ops/ENV_AND_DEPLOYMENT_RUNBOOK.md),
	[../10-flows/AUTH_AND_PARENT_PORTAL_FLOW.md](../10-flows/AUTH_AND_PARENT_PORTAL_FLOW.md),
	[../10-flows/CHILD_JOURNEY_FLOW.md](../10-flows/CHILD_JOURNEY_FLOW.md)

Use this checklist before approving a preview build for merge.

## 1) Branch and build gate

- [ ] Branch is rebased/updated with base branch.
- [ ] `npm install` completed without dependency conflicts.
- [ ] `npm run build` succeeds locally.
- [ ] Any schema change includes a migration in `supabase/migrations`.
- [ ] Migration filenames are timestamped and ordered correctly.

## 2) Environment gate (preview)

- [ ] Vercel preview has valid `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`.
- [ ] Vercel preview has valid `OPENAI_API_KEY` and database URL(s).
- [ ] Vercel preview has valid `/api/spark` hardening keys (`API_AUTH_ENABLED`, `API_RATE_LIMIT_ENABLED`, request bounds).
- [ ] Vercel preview has `OPENAI_SERVER_MODEL` set and aligned with `OPENAI_ALLOWED_MODELS`.
- [ ] Cache control env values are set intentionally (not inherited by accident).
- [ ] Preview Supabase project has Google provider enabled.
- [ ] OAuth redirect and allowlist includes preview deployment URL(s).

## 3) Parent auth and security gate

- [ ] Parent can sign in with Google.
- [ ] Parent can access `/parent` only when parent auth state is valid.
- [ ] First-time PIN creation path succeeds.
- [ ] Existing PIN verify path succeeds.
- [ ] Failed PIN attempts increment and lock after limit.
- [ ] Lockout countdown is enforced and clears after expiry.
- [ ] Change PIN flow validates current PIN and persists new PIN.
- [ ] Sign out clears parent/child-sensitive local state.

## 4) Child journey gate

- [ ] Parent can create, edit, delete child profiles.
- [ ] Child profile selection opens child-mode correctly.
- [ ] Classic mode progression works: Story -> Explanation -> Quiz -> Badge.
- [ ] Curious mode progression works: Story -> Curiosity choice -> branch content.
- [ ] Demo mode progression works: Story -> Explanation -> Activity -> Quiz -> Badge.
- [ ] Demo quiz renders exactly 4 questions and excludes open/hint prompt flow.
- [ ] Demo badge screen hides quick game CTA.
- [ ] Non-demo badge screen shows superpower reveal and mastery copy correctly.
- [ ] Non-demo quick game CTA launches and only allows one play per badge view.
- [ ] Progress/badge state is written once and is idempotent on refresh.
- [ ] Exit child mode returns to safe parent-controlled route.

## 5) API and cache gate

- [ ] `/api/spark` returns valid response in all expected modes.
- [ ] First request for a prompt is miss (or store path), second is hit.
- [ ] Prompt versioning affects cache key as expected.
- [ ] If semantic cache is enabled, similar prompts can resolve to cached result.
- [ ] No secret values appear in API error payloads.

## 6) Billing and subscription gate

- [ ] `STRIPE_SECRET_KEY` is a restricted key (not full `sk_live`) with correct scopes.
- [ ] `STRIPE_PRICE_MONTHLY_699` is a `price_...` ID (not `prod_...`).
- [ ] `STRIPE_WEBHOOK_SECRET` matches the live webhook endpoint signing secret.
- [ ] Webhook endpoint in Stripe dashboard points to `https://whyroo.com/api/billing/webhook`.
- [ ] Checkout flow completes end-to-end (real card in live mode or test card in test mode).
- [ ] Webhook fires on checkout and subscription events (verify in Stripe dashboard → Webhooks → Recent deliveries).
- [ ] Parent portal shows correct subscription status and period-end date after checkout.
- [ ] Customer portal accessible via "Manage Billing" button.
- [ ] Cancellation flow shows "access until date" copy (not plain "active").
- [ ] Free tier usage meter shows correctly for non-paid users.

## 7) Data and RLS gate

- [ ] Parent can only view/update their own children and related records.
- [ ] Child searches and badges are scoped to the owning parent-child relation.
- [ ] No cross-parent leakage via direct table reads.
- [ ] New columns/tables have matching constraints and RLS coverage.

## 8) Regression and usability gate

- [ ] Mobile layout remains usable on primary screens.
- [ ] Parent portal entry control is still discoverable only via intended gesture.
- [ ] Error messages are actionable (no raw stack traces).
- [ ] Loading and disabled states prevent duplicate writes.

## 9) PR readiness gate

- [ ] PR description includes: scope, risk level, migrations, env changes, and test notes.
- [ ] Screenshots or short video attached for UI-affecting changes.
- [ ] Follow-up items are listed explicitly as non-blocking TODOs.

## 10) Go/No-go rubric

Go if:

- all gates above are checked, and
- no critical/major regression remains open.

No-go if any of these occur:

- auth or PIN gate broken
- RLS or data leakage risk detected
- preview env mismatch cannot be validated
- build or migration state is uncertain
