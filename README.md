# CommonGround

AI-powered local social discovery. A personal agent learns what you like and when you're free,
finds compatible people and groups nearby, and turns aggregated community demand into event
proposals that local businesses approve before anything is published.

Specs live in [`specs/`](./specs/README.md). This README covers getting the app running.

## Quick start (under 10 minutes)

Requirements: Node 20+, pnpm 10, Docker (for the local Supabase stack).

```bash
pnpm install
pnpm db:start                 # starts Postgres + Auth + PostgREST in Docker, applies supabase/migrations
cp .env.example .env          # then paste the anon + service_role keys printed by db:start
cp .env .env.local            # Next.js reads .env.local; the seed and tests read .env
pnpm db:seed                  # 15 users, 3 business owners, demo notifications (password: demo-pass-1234)
pnpm dev -p 3100              # http://localhost:3100
```

`MOCK_AI=1` (default in `.env.example`) serves fixtures from `src/lib/ai/fixtures/` instead of
calling Claude, so everything works offline. Set `ANTHROPIC_API_KEY` and `MOCK_AI=0` for live AI.

Demo accounts (all `demo-pass-1234`):

| Account | Use |
|---|---|
| `demo.new@commonground.test` | Brand-new member, no preferences (Scene 1) |
| `maya@commonground.test` | Onboarded consumer with notifications |
| `owner.kiln-and-cup@commonground.test` | Pottery studio owner (business shell) |

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js |
| `pnpm lint` / `pnpm typecheck` | ESLint, `tsc --noEmit` |
| `pnpm test` | Vitest unit tests (no database needed) |
| `pnpm test:integration` | Vitest against the local Supabase stack (RLS, notify, seed) |
| `pnpm test:e2e` | Playwright smoke + theme screenshots (`MOCK_AI=1`) |
| `pnpm db:start` / `db:stop` / `db:reset` | Local Supabase lifecycle; `reset` re-applies all migrations |
| `pnpm db:types` | Regenerate `src/lib/supabase/database.types.ts` (commit the result) |
| `pnpm db:seed` | Idempotent demo dataset (`POST /api/dev/seed` does the same in dev) |

## Layout

```
src/app            routes: (consumer), (business), (auth), api/
src/features/core  auth, notifications, API envelope consumers, app shell, ui primitives
src/lib/api        ok(), fail(), withAuth(), withBusinessOwner(), parseBody()
src/lib/ai         generateStructured(), chat(), MOCK_AI fixtures, prompt registry
src/lib/supabase   server/client/admin clients, generated Database types
src/shared         enums, cross-workstream types, Zod schemas
src/styles         tokens.css (light + dark), global.css
supabase           migrations/ (0100–0699 by workstream), seed/
tests              unit/ integration/ e2e/
```

Every Route Handler returns `{ ok: true, data }` or `{ ok: false, error: { code, message } }`
and is wrapped in `withAuth` unless a comment marks it public. See `specs/README.md` §4.

## Deployment

Vercel (web) + hosted Supabase. Required env vars: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `MOCK_AI`,
`DEMO_MODE`, `MIN_COHORT_SIZE`, `OPPORTUNITY_CRON_SECRET`, `NEXT_PUBLIC_SITE_URL`. Apply migrations
with `supabase db push` against the hosted project. The dev seed route is unreachable in
production unless `DEMO_MODE=1`.
