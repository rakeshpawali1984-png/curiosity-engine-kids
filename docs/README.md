# Curiosity Engine Documentation

This directory is intended to let any new developer, product teammate, or operator understand and safely work on the product without relying on oral context.

## Read path for new team members

1. Read product intent and current scope:
	[00-product/PRODUCT_OVERVIEW.md](00-product/PRODUCT_OVERVIEW.md)
2. Read parent authentication and protection flows:
	[10-flows/AUTH_AND_PARENT_PORTAL_FLOW.md](10-flows/AUTH_AND_PARENT_PORTAL_FLOW.md)
3. Read child-facing experience and state transitions:
	[10-flows/CHILD_JOURNEY_FLOW.md](10-flows/CHILD_JOURNEY_FLOW.md)
4. Read architecture and trust boundaries:
	[20-architecture/SYSTEM_ARCHITECTURE.md](20-architecture/SYSTEM_ARCHITECTURE.md)
5. Read schema and RLS:
	[30-data/DATA_MODEL_AND_RLS.md](30-data/DATA_MODEL_AND_RLS.md)
6. Read security assumptions and hardening roadmap:
	[40-security/PARENT_PIN_SECURITY_MODEL.md](40-security/PARENT_PIN_SECURITY_MODEL.md)
7. Read environment and deployment runbook:
	[50-ops/ENV_AND_DEPLOYMENT_RUNBOOK.md](50-ops/ENV_AND_DEPLOYMENT_RUNBOOK.md)
8. Read developer onboarding and code-change guide:
	[DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md)
9. Read test and validation guide:
	[TESTING_GUIDE.md](TESTING_GUIDE.md)
10. Use release checklist before pushing branch or merging:
	[60-release/PREVIEW_RELEASE_CHECKLIST.md](60-release/PREVIEW_RELEASE_CHECKLIST.md)

## Documentation map

- Product: [00-product](00-product)
- Flows: [10-flows](10-flows)
- Architecture: [20-architecture](20-architecture)
- Data and RLS: [30-data](30-data)
- Security: [40-security](40-security)
- Ops runbooks: [50-ops](50-ops)
- Developer guide: [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md)
- Testing guide: [TESTING_GUIDE.md](TESTING_GUIDE.md)
- Release process: [60-release](60-release)

## Existing external reference in repo

- Environment mapping history and notes:
  [../SUPABASE_ENVIRONMENTS.md](../SUPABASE_ENVIRONMENTS.md)

## Contribution standard for docs

Each document should include:

- Owner
- Last updated date
- Status (draft, active, deprecated)
- Related docs
- Related code paths

Each feature PR should update docs when it changes:

- user behavior
- routing or auth
- schema or RLS
- env requirements
- release checks

