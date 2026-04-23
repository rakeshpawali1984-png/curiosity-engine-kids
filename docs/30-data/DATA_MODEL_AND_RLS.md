# Data Model and RLS

- Owner: TBD
- Last updated: 2026-04-23
- Status: active
- Related docs:
	[../40-security/PARENT_PIN_SECURITY_MODEL.md](../40-security/PARENT_PIN_SECURITY_MODEL.md),
	[../10-flows/AUTH_AND_PARENT_PORTAL_FLOW.md](../10-flows/AUTH_AND_PARENT_PORTAL_FLOW.md)
- Related migrations:
	[supabase/migrations/20260413111500_init_parent_child_profiles.sql](supabase/migrations/20260413111500_init_parent_child_profiles.sql),
	[supabase/migrations/20260413170000_add_parent_pin_columns.sql](supabase/migrations/20260413170000_add_parent_pin_columns.sql)

## Data ownership model

1. auth.users row owns one parents row (id shared)
2. parents row owns many child_profiles rows
3. child_profiles row owns many child_searches and child_badges rows

Ownership key:

- auth.uid() == parents.id == child_profiles.parent_id

## Tables and key fields

### parents

Purpose:

- parent identity projection and parent security metadata

Important fields:

1. id (uuid, PK, references auth.users.id)
2. email (text, unique)
3. display_name (text)
4. parent_pin_hash (text, nullable)
5. parent_pin_salt (text, nullable)
6. parent_pin_set_at (timestamptz, nullable)

Constraint:

- hash and salt must both be null or both non-null

### child_profiles

Purpose:

- represents child identities under a parent

Important fields:

1. id (uuid, PK)
2. parent_id (uuid, FK to parents.id)
3. name (non-blank)
4. avatar_emoji
5. age_range
6. created_at

Business rule:

- max 3 profiles per parent enforced by trigger function

### child_searches

Purpose:

- logs child exploration queries and metadata

Important fields:

1. id (uuid, PK)
2. child_id (uuid, FK to child_profiles.id, on delete cascade)
3. query_text
4. search_type
5. response_summary (jsonb, currently optional)
6. created_at

### child_badges

Purpose:

- stores awarded badges per child

Important fields:

1. id (uuid, PK)
2. child_id (uuid, FK to child_profiles.id, on delete cascade)
3. badge_key
4. badge_title
5. source_search_id (optional FK to child_searches)
6. awarded_at

Constraint:

- unique (child_id, badge_key)

## RLS policy model

RLS enabled on:

1. parents
2. child_profiles
3. child_searches
4. child_badges

Policy principle:

- parent can only read/write rows that resolve to auth.uid() ownership

Patterns:

1. direct parent table checks (id = auth.uid())
2. child table checks via exists subquery against child_profiles.parent_id

## Indexes and performance notes

Defined indexes include:

1. child_profiles by parent_id
2. child_searches by child_id
3. child_searches by created_at desc
4. child_badges by child_id

These support:

1. profile lists
2. recent history retrieval
3. child badge shelf rendering

## Lifecycle and deletion semantics

1. Delete child profile -> cascades child_searches and child_badges.
2. Delete history action -> deletes child_searches only.
3. Badges survive history deletion by design.

## Derived superpower model (current)

1. Learning superpowers are inferred at runtime from child history and topic/badge text.
2. Superpower catalog is configured in app code (`src/data/curiositySuperpowersConfig.js`).
3. No dedicated superpower persistence table exists yet.
4. Journey and badge screens consume derived superpower summaries directly.

## Migration discipline notes

1. Migrations are environment-promoted (dev -> preview -> prod).
2. Keep dev link restored after pushing to non-dev projects.
3. Record new data assumptions in this doc when schema evolves.

