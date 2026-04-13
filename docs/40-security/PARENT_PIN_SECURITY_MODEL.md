# Parent PIN Security Model

- Owner: TBD
- Last updated: 2026-04-13
- Status: active
- Related docs:
	[../10-flows/AUTH_AND_PARENT_PORTAL_FLOW.md](../10-flows/AUTH_AND_PARENT_PORTAL_FLOW.md),
	[../30-data/DATA_MODEL_AND_RLS.md](../30-data/DATA_MODEL_AND_RLS.md)
- Related code: [../../src/App.jsx](../../src/App.jsx)

## Threat model objective

Prevent children from accessing parent-only management actions on shared devices where parent is already authenticated.

Primary threats addressed:

1. accidental entry into parent controls
2. simple repeated guessing of PIN
3. bypassing lockout by refreshing page

## Current control stack

1. Route isolation
- parent controls only rendered on /parent route

2. Entry obscurity
- no visible parent button in child UI
- hidden long-press only navigates to parent route

3. Parent PIN gate
- mandatory PIN verification before parent content renders
- required each route visit (no time-based carryover unlock)

4. PIN brute-force mitigation
- 5 failed attempts then 60-second lockout
- lockout state persisted in sessionStorage by parent user id

5. PIN lifecycle controls
- first-time setup
- verify
- change PIN (requires current PIN)

## Cryptographic handling (current)

1. salt generated using browser crypto random values
2. hash computed using SHA-256 over salt:pin
3. hash and salt stored in parent row
4. verify by recomputing with stored salt

## Security boundaries

1. Parent identity trust comes from Supabase Auth session.
2. PIN trust is app-layer control over parent route UX.
3. Data-level ownership remains enforced by RLS.

## Residual risks

1. Client-side verification model means hash and salt are available to authenticated parent session.
2. No out-of-band recovery flow (forgot PIN) yet.
3. No centralized security audit trail for PIN events yet.

## Hardening roadmap

1. Move PIN verification to server-side endpoint with challenge tokens.
2. Add forgot PIN with re-auth challenge (Google session recency or magic-link flow).
3. Add event logging for:
	 - pin_setup
	 - pin_verify_success
	 - pin_verify_fail
	 - pin_lockout
	 - pin_change
4. Consider optional cooldown escalation for repeated lockouts.

