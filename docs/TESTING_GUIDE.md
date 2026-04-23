# Testing Guide

- Owner: TBD
- Last updated: 2026-04-23
- Status: active
- Related docs:
	[DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md),
	[10-flows/AUTH_AND_PARENT_PORTAL_FLOW.md](10-flows/AUTH_AND_PARENT_PORTAL_FLOW.md),
	[10-flows/CHILD_JOURNEY_FLOW.md](10-flows/CHILD_JOURNEY_FLOW.md),
	[60-release/PREVIEW_RELEASE_CHECKLIST.md](60-release/PREVIEW_RELEASE_CHECKLIST.md)

Current project validation is primarily build + manual smoke testing.

## 1. Baseline checks (every change)

1. Install dependencies if needed:

```bash
npm install
```

2. Build app:

```bash
npm run build
```

3. Start app and verify main route renders:

```bash
npm run dev
```

## 2. Parent auth and portal smoke tests

1. Parent sign-in:
- Google sign-in succeeds
- app loads parent/child data without crash

2. Parent route protection:
- navigate to `/parent`
- verify PIN setup on first use or PIN verify when already set

3. Lockout behavior:
- enter incorrect PIN 5 times
- lockout message/countdown appears
- refresh does not bypass lock

4. Change PIN behavior:
- incorrect current PIN fails
- valid current PIN + new PIN succeeds
- new PIN works for next verify

5. Sign-out behavior:
- sign out clears state and returns to login

## 3. Child journey smoke tests

1. Child profile basics:
- create child
- edit child
- delete child

2. Classic flow (`/get-curious`):
- home -> story -> explanation -> activity -> quiz -> badge
- badge writes to child history

3. Curious flow (`/`):
- ask question
- verify safe response renders
- complete quiz path
- verify badge + search logging

4. Journey view:
- displays child-specific badges and recent discoveries

5. Demo mode (`/demo`):
- home shows static topic cards sourced from `src/data/topics.js`
- selected demo topic completes Story -> Explanation -> Activity -> Quiz -> Badge
- quiz renders exactly 4 questions
- open-ended hint/sample-answer prompt does not appear
- badge screen does not show `Play a Quick Game`

## 4. API and cache validation

Use this when changing AI/cache logic.

1. Ensure env keys set for serverless path (`OPENAI_API_KEY`, DB URL).
2. Trigger same prompt twice on `/api/spark` path.
3. Confirm first call is miss/openai and second call is cache hit.
4. Check response headers:
- `x-cache-status`
- `x-cache-policy`
- `x-cache-lookup`

## 5. Local API auth and throttling validation

Use this only for local verification before preview rollout.

1. In `.env.local`, enable:
- `API_AUTH_ENABLED=true`
- `API_RATE_LIMIT_ENABLED=true`
- `OPENAI_SERVER_MODEL=gpt-4.1-mini`

2. Run local frontend and API runtimes:

```bash
npm run dev:web
npm run dev:api
```

3. While signed in, call `/api/spark` from app and verify success.

4. Validate negative auth cases with curl/Postman:
- no bearer token -> `401`
- invalid bearer token -> `401`

4b. Validate payload hardening and error surface:
- malformed payload -> `400` with generic error text (`Invalid request payload`)
- disallowed/over-limit fields -> `400` with generic error text
- verify response does not list allowed models or size/token limits

5. Validate throttling:
- send repeated valid requests quickly
- verify `429` appears after configured limit
- verify retry behavior via `retry-after` and rate-limit headers

6. Validate backend model ownership:
- send proxy request without `model` and verify success
- send proxy request with any `model` value and verify behavior is unchanged (server model policy applies)

## 6. Data and RLS validation

1. Parent can only access own child rows.
2. Child searches and badges remain child-scoped.
3. Delete child history removes searches and keeps badges.
4. Delete child profile cascades related child records.

## 7. Migration validation

When schema changes are introduced:

1. Ensure migration file exists in `supabase/migrations`.
2. Apply migration to target environment in correct order.
3. Re-run parent and child smoke checks touching changed tables.
4. Confirm no RLS regressions for cross-parent isolation.

## 8. Release readiness

Before merge, run the full release gate:

- [60-release/PREVIEW_RELEASE_CHECKLIST.md](60-release/PREVIEW_RELEASE_CHECKLIST.md)
