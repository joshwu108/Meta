# CommonGround

AI-powered local social discovery. A personal agent learns what you like and when you're free,
finds compatible people and groups nearby, and turns aggregated community demand into event
proposals that local businesses approve before anything is published.

Specs live in [`specs/`](./specs/README.md). This README covers getting the app running.

## Quick start (under 10 minutes)

Requirements: Node 22+ (pnpm runs scripts on the Node pinned in `.npmrc`), pnpm 10, Docker (for the local Supabase stack).

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

## Adding a workstream module

1. **Migration**: `supabase/migrations/0N00_<ws>_<name>.sql` in your number range (02 → 0200–0299,
   03 → 0300–0399, …). Enable RLS on every table; the integration test `rls-guard` fails otherwise.
   Reuse `public.set_updated_at()` for `updated_at`. Then `pnpm db:reset && pnpm db:types` and commit
   the regenerated `database.types.ts`.
2. **Feature folder**: `src/features/<name>/{server,components,hooks,schemas.ts,index.ts}`. Other
   features import only from your `index.ts`. Until a dependency lands, build against
   `src/shared/types.ts` with a stub in `src/features/<name>/server/stubs.ts`.
3. **Routes**: `src/app/api/<resource>/route.ts`, wrapped in `withAuth` / `withBusinessOwner`
   from `@/lib/api`; validate bodies with `parseBody(schema, req)` and queries with `parseQuery`.
   Throw `ApiError(code, message)` for expected failures. Use `aiRateLimiter.assert(user.id)` on AI routes.
4. **AI**: add your prompt ids to `src/lib/ai/prompts/index.ts` and a fixture at
   `src/lib/ai/fixtures/<promptId>.json`; call `generateStructured({ prompt, input, schema })`.
5. **Seed**: append fixtures under `supabase/seed/fixtures/` and extend the loader in
   `supabase/seed/loaders/` for your tables (`domain.ts` already inserts businesses, events and
   groups with the column names from the specs and skips while a table is missing).
6. **Tests**: unit in `tests/unit/<area>/`, database tests in `tests/integration/` using
   `createTestUser()` from `tests/integration/helpers.ts`, demo scenes in `tests/e2e/`.
7. **Screens**: build on the primitives in `src/features/core/components/ui` and the tokens in
   `src/styles/tokens.css`; mark AI output with `AiTag` only. Placeholders for your routes already
   exist under `src/app/(consumer)` and `src/app/(business)`; replace the `PlaceholderPage` call.
