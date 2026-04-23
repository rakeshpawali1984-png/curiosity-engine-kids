# Developer Guide

- Owner: TBD
- Last updated: 2026-04-23
- Status: active
- Related docs:
	[README.md](README.md),
	[20-architecture/SYSTEM_ARCHITECTURE.md](20-architecture/SYSTEM_ARCHITECTURE.md),
	[30-data/DATA_MODEL_AND_RLS.md](30-data/DATA_MODEL_AND_RLS.md),
	[50-ops/ENV_AND_DEPLOYMENT_RUNBOOK.md](50-ops/ENV_AND_DEPLOYMENT_RUNBOOK.md),
	[TESTING_GUIDE.md](TESTING_GUIDE.md)

This guide is for engineers making product changes, not just operating deploys.

## 1. Mental model first

Curiosity Engine is a single-page React app plus serverless API endpoints.

1. Parent signs in with Google (Supabase Auth).
2. Parent can manage child profiles in `/parent` (PIN-gated route).
3. Child uses curious flow at `/` or classic flow at `/get-curious`.
4. Child actions write scoped history/badges in Supabase tables.
5. Curious API calls pass through `/api/spark` with cache control in `api/cache.js`.

## 2. Local setup for coding

1. Install:

```bash
npm install
```

2. Create env:

```bash
cp .env.example .env.local
```

3. Minimum keys in `.env.local`:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `OPENAI_API_KEY`

4. Start frontend:

```bash
npm run dev
```

5. Optional full local API path:

- set `VITE_USE_LOCAL_PROXY=true`
- run `npm run dev:web` and `npm run dev:api`

## 3. Project map (where to change what)

### App orchestration

- `src/App.jsx`

Use when changing:

1. auth/session lifecycle
2. route-to-screen branching
3. parent gate + PIN flow orchestration
4. active child state and cross-screen transitions
5. demo mode topic/quiz normalization and restrictions

### Parent portal UI and flows

- `src/components/LoginScreen.jsx`
- `src/components/ChildProfilesScreen.jsx`
- `src/components/FamilyTopBar.jsx`

Use when changing:

1. parent sign-in UI
2. child CRUD, parent settings, change PIN UX
3. parent portal entry behavior from child mode

### Child experience screens

- `src/components/HomeScreen.jsx`
- `src/components/StoryScreen.jsx`
- `src/components/ExplanationScreen.jsx`
- `src/components/ActivityScreen.jsx`
- `src/components/QuizScreen.jsx`
- `src/components/BadgeScreen.jsx`
- `src/components/CuriousScreen.jsx`
- `src/components/JourneyScreen.jsx`
- `src/components/games/SpeedTap.jsx`
- `src/components/games/FlashFacts.jsx`
- `src/components/games/EmojiCryptogram.jsx`

Use when changing:

1. child learning sequence
2. curious prompts and render behavior
3. journey and badge presentation
4. demo-only UX restrictions (quiz/game gating)

### Superpower subsystem

- `src/lib/curiositySuperpowers.js`
- `src/data/curiositySuperpowersConfig.js`

Use when changing:

1. superpower inference keywords/logic
2. superpower names, emoji, summaries, and defaults
3. dominant superpower ranking behavior in journey/badge contexts

## Demo mode constraints (current)

Route:

1. `/demo`

Behavior contract:

1. Demo cards are selected from static `src/data/topics.js`.
2. Demo quiz must always render 4 questions.
3. Demo quiz excludes `open` question type.
4. Demo badge screen does not allow quick game entry.

Primary code paths:

1. `src/App.jsx` (topic normalization + demo flow)
2. `src/components/QuizScreen.jsx` (quiz rendering)
3. `src/components/BadgeScreen.jsx` (quick game CTA gating)

### Data access layer

- `src/lib/supabaseClient.js`
- `src/lib/familyData.js`

Use when changing:

1. Supabase client initialization
2. parent/child read-write operations
3. badge and search logging behavior

### Serverless AI and cache

- `api/spark.js`
- `api/cache.js`

Use when changing:

1. model proxy behavior
2. cache read/write policy and diagnostics headers
3. semantic cache thresholds and TTL behavior

Current /api/spark policy:

1. frontend proxy requests should not be treated as model selectors.
2. model is selected by backend env via `OPENAI_SERVER_MODEL`.
3. client-facing validation errors should remain generic to avoid leaking policy internals.

### Schema and migrations

- `supabase/migrations/*`

Use when changing:

1. table structure
2. constraints
3. RLS policies

## 4. Common change playbooks

### A) Add a new child-facing step

1. Create/update screen component in `src/components`.
2. Add route/state transition in `src/App.jsx`.
3. Update flow docs in `docs/10-flows/CHILD_JOURNEY_FLOW.md`.
4. Run local build and smoke test with at least one child profile.

### B) Change parent security behavior

1. Update parent flow logic in `src/App.jsx`.
2. Update parent portal UI in `src/components/ChildProfilesScreen.jsx`.
3. If schema changes, add new migration in `supabase/migrations`.
4. Update docs in:
	- `docs/10-flows/AUTH_AND_PARENT_PORTAL_FLOW.md`
	- `docs/40-security/PARENT_PIN_SECURITY_MODEL.md`

### C) Tune AI/cache behavior

1. Update lookup/store logic in `api/cache.js` and/or proxy behavior in `api/spark.js`.
2. Validate exact miss->hit behavior locally.
3. Validate header diagnostics (`x-cache-status`, `x-cache-policy`, `x-cache-lookup`).
4. Update `docs/20-architecture/SYSTEM_ARCHITECTURE.md` and `docs/50-ops/ENV_AND_DEPLOYMENT_RUNBOOK.md`.

## 5. Debugging checklist

### Sign-in issues

1. Confirm env values in `.env.local`.
2. Confirm Google provider enabled in target Supabase project.
3. Confirm redirect allowlist includes current origin.

### Parent route issues

1. Confirm route is `/parent`.
2. Confirm parent row has PIN fields when expected.
3. Check browser console for hash/verify flow errors.

### Missing child data

1. Confirm `activeChildId` is set in app state.
2. Confirm RLS allows current parent to access child rows.
3. Confirm child IDs passed to data functions are valid.

### Cache appears off

1. Confirm env toggles (`CACHE_ENABLED`, `CACHE_READ_ENABLED`).
2. Confirm DB URL and OpenAI key available in serverless runtime.
3. Check response headers from `/api/spark`.

## 6. Definition of done for code changes

1. Local build passes (`npm run build`).
2. Changed flows are manually smoke-tested.
3. Schema changes include migration and RLS review.
4. Docs are updated in `docs/` for behavior, data, env, or release impacts.
5. Preview release checklist is run before merge:
	[60-release/PREVIEW_RELEASE_CHECKLIST.md](60-release/PREVIEW_RELEASE_CHECKLIST.md)
