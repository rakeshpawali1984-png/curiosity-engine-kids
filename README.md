# Curiosity Engine

Curiosity Engine is a parent-managed, child-safe learning app with two experiences:

- classic guided topic flow
- open-ended curious flow with safety pipeline

This root README is the fastest way to run the project locally. For deep product and architecture details, use the docs hub:

- [docs/README.md](docs/README.md)

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Create local env file:

```bash
cp .env.example .env.local
```

3. Fill required values in [.env.local](.env.local):

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `OPENAI_API_KEY`

4. Run frontend:

```bash
npm run dev
```

5. Open app at the local Vite URL shown in terminal.

## Run with local API proxy (optional)

Use this when you want to test the full serverless cache path locally.

1. Set `VITE_USE_LOCAL_PROXY=true` in [.env.local](.env.local)
2. Run frontend and API in separate terminals:

```bash
npm run dev:web
npm run dev:api
```

## Available scripts

- `npm run dev` -> run Vite frontend
- `npm run dev:web` -> run Vite frontend explicitly
- `npm run dev:api` -> run Vercel local serverless runtime
- `npm run build` -> production build
- `npm run preview` -> preview production build locally

## Where to read next

- Developer onboarding and code map: [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md)
- Testing and validation matrix: [docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md)
- Environment/deploy runbook: [docs/50-ops/ENV_AND_DEPLOYMENT_RUNBOOK.md](docs/50-ops/ENV_AND_DEPLOYMENT_RUNBOOK.md)
