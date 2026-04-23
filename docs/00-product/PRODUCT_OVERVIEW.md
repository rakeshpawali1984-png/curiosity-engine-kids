# Product Overview

- Owner: TBD
- Last updated: 2026-04-23
- Status: active
- Related docs:
	[../10-flows/AUTH_AND_PARENT_PORTAL_FLOW.md](../10-flows/AUTH_AND_PARENT_PORTAL_FLOW.md),
	[../10-flows/CHILD_JOURNEY_FLOW.md](../10-flows/CHILD_JOURNEY_FLOW.md),
	[../40-security/PARENT_PIN_SECURITY_MODEL.md](../40-security/PARENT_PIN_SECURITY_MODEL.md)
- Related code: [../../src/App.jsx](../../src/App.jsx)

## Vision and product intent

Curiosity Engine is a child-safe learning experience where:

1. children can explore topics in an engaging flow,
2. each child has isolated progress and history,
3. parent access is protected and clearly separated from child navigation.

The product is intentionally designed with parent-first control and child-first interaction.

## Primary users

1. Parent or guardian (account owner)
- creates and manages child profiles
- controls child switching and data management
- controls parent-only settings through protected portal

2. Child (end learner)
- consumes stories, explanations, activities, quizzes
- sees own journey (badges and discoveries)
- does not see parent controls in normal UI

## Product pillars (current)

1. Safe curiosity generation
- AI content has layered input and output safeguards.

2. Family data isolation
- parent account owns children
- children have separate search and badge data

3. Parent control protection
- parent route isolation (/parent)
- per-parent PIN setup, verification, change
- failed attempt lockout

4. Operational safety
- environment separation (dev, preview, prod)
- migration-driven schema evolution
- preview-first rollout practice

## Current functional scope

1. Authentication
- Parent Google OAuth via Supabase Auth.

2. Parent portal
- Route: /parent.
- Features: select child, add child (up to 3), view child badges/history, delete history, delete child profile, change PIN, sign out.

3. Child experience
- Classic flow: home -> story -> explanation -> activity -> quiz -> badge.
- Curious flow: question -> generated learning content -> quiz -> badge + curiosity prompts.
- Badge screen includes learning superpower reveal and mastery feedback.
- Optional post-quiz mini-game engagement in non-demo mode.
- Journey screen for child-facing progress, including dominant superpower summary.
- Demo mode provides fixed static-topic preview with restricted progression loops.

4. Data model
- parents
- child_profiles
- child_searches
- child_badges

## Explicit non-goals (current phase)

1. Subscription monetization in production.
2. Parent analytics beyond current history/badge views.
3. Fully server-side PIN verification architecture.

## Key decisions already locked

1. Parent-level account model (not per-child auth).
2. Maximum 3 child profiles per parent.
3. Delete child profile is hard delete (cascade).
4. Delete child history preserves badges.
5. Parent portal PIN is required each route visit.

## Near-term product roadmap themes

1. Subscription gating (planned)
- likely free 1 child profile + limited searches, paid up to 3 child profiles.

2. Badge economy refinement
- evaluate milestone-based badges to avoid badge inflation.

3. Superpower progression model
- evolve from flat superpower summary toward kid-friendly mastery levels and rewards.

4. Parent account recovery hardening
- forgot PIN flow with re-auth challenge.

