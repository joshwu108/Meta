# Weave

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
pnpm db:seed                  # demo accounts + 300 generated people (password: demo-pass-1234)
pnpm dev -p 3100              # http://localhost:3100
```

### AI provider

`MOCK_AI=1` (default in `.env.example`) serves fixtures from `src/lib/ai/fixtures/` instead of
calling a model, so everything works offline.

For live AI, set `MOCK_AI=0` plus one credential. `AI_PROVIDER` picks the vendor; left unset, the
first key present wins, Llama first:

| Provider | Env | Tiers (`smart` / `fast`) |
|---|---|---|
| Meta Model API (Muse) | `META_API_KEY` | `muse-spark-1.3` / `muse-spark-1.1` |
| Meta Llama API | `LLAMA_API_KEY` | `Llama-4-Maverick-17B-128E-Instruct-FP8` / `Llama-4-Scout-17B-16E-Instruct-FP8` |
| Anthropic | `ANTHROPIC_API_KEY` | `claude-sonnet-5-5` / `claude-haiku-5-5` |

Both Meta keys look like `LLM|<app-id>|<token>` — the pipes are part of the key, so quote the
value in `.env.local`. **They are different services with separate entitlements:** Muse is served
by the Meta Model API at `api.meta.ai`, Llama by `api.llama.com`, and a key entitled to one
returns `403 permission_denied` on the other. Check which you have with `pnpm ai:check`.

Muse Spark is a reasoning model: it spends hidden reasoning tokens before emitting content (even
a one-word answer costs 200–500), so it gets a larger default budget and an exhausted budget
returns empty content rather than an error. Override with `AI_MAX_TOKENS`, or the model ids with
`MUSE_MODEL_SMART` / `MUSE_MODEL_FAST`.

Structured output goes through `response_format: json_schema` on both Meta APIs — Muse rejects a
named `tool_choice`, so the forced-tool-call path is Anthropic-only.

`pnpm ai:check` drives one real structured call through `src/lib/ai` and prints what is wrong
(missing key, bad quoting, or a model the app is not entitled to) without printing the key.

### Seed volume

`pnpm db:seed` loads the hand-written demo fixtures **and** a generated population of 300 people.
The demo accounts are untouched by this; generated emails are namespaced under `gen.` so nothing
the e2e suites assert on can collide.

The volume exists because the demand pipeline needs density: a cluster must reach
`MIN_COHORT_SIZE` (4) inside one geocell for a single `(category, slot)` pair, and a proposal
additionally needs that cluster within 3km of a venue of the same category. Spread thinly, nobody
clusters -- the original 15-row seed produced **zero** clusters, which is why the business side had
nothing to suggest. So cohorts are *planted*: `supabase/seed/generate/cohorts.ts` pins a category,
a slot, a tight centre and a shared core of interest tags per cohort. Measured, planting covers
15/15 venue-critical combinations where volume alone covers 4/15.

| Env | Effect |
|---|---|
| `SEED_SCALE` | Generated headcount, default 300. `0` disables it (CI and Playwright use this so test runtime does not regress) |

Generation is deterministic from a fixed seed, so a reseed produces the same people and tests can
assert on them. Verify the result with:

```bash
pnpm tsx tests/evals/demand/cluster-check.ts   # clusters the real seeded rows, no AI
curl -H "Authorization: Bearer $OPPORTUNITY_CRON_SECRET" localhost:3100/api/cron/opportunities
```

### Semantic matching (pgvector)

Exact-tag matching scored `pottery` against `ceramics` as **zero**, so conceptually close people
never met. The interests component is now a blend: `0.6 x` exact-tag Jaccard `+ 0.4 x` semantic
similarity from embeddings.

Meta's Model API has no `/v1/embeddings` endpoint, so vectors are produced locally by
`@huggingface/transformers` (all-MiniLM-L6-v2, 384 dims) and stored in pgvector
(migration 0702). Set `EMBEDDING_MODEL` to swap models; the dimension must stay 384.

```bash
pnpm embed:backfill           # only rows whose text changed
pnpm embed:backfill --force   # re-embed everything
```

Backfill is idempotent: `profile_embeddings.source_hash` fingerprints the embedded text, so a
reseed skips unchanged rows (317 profiles re-check in under 300ms).

Two tables, because they answer different questions. `profile_embeddings` drives the score;
`interest_embeddings` (one row per tag) exists to keep matches **explainable**. This app drops
any highlight absent from the input and rejects explanations citing an interest only one side
holds, so a cosine score is not a usable reason. When semantic similarity drives a match with no
shared tag, the highlight becomes the nearest *named* concept pair — `ceramics` ↔ `pottery` —
real values from both profiles. No user is ever shown a number.

The two levels use different floors (`SEMANTIC_FLOOR` in `matching/server/weights.ts`) because
their distributions differ: tag pairs median 0.24, profile pairs median 0.59. A single floor of
0.45 admitted 93.6% of profile pairs — a near-uniform bonus that stopped discriminating. The
floors are 0.45 for tags (5.3% qualify) and 0.70 for profiles (16.7% qualify).

If the vector tables are empty or unreachable, matching degrades to exact-tag scoring and logs a
warning. A semantic bonus is an enhancement, never a dependency.

Demo accounts (all `demo-pass-1234`):

| Account | Use |
|---|---|
| `demo.new@weave.test` | Brand-new member, no preferences (Scene 1) |
| `maya@weave.test` | Onboarded consumer with notifications |
| `owner.kiln-and-cup@weave.test` | Pottery studio owner (business shell) |

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
src/lib/ai         generateStructured(), chat(), provider adapters, MOCK_AI fixtures, prompts
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
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AI_PROVIDER` with either
`LLAMA_API_KEY` or `ANTHROPIC_API_KEY`, `MOCK_AI`, `DEMO_MODE`, `MIN_COHORT_SIZE`,
`OPPORTUNITY_CRON_SECRET`, `NEXT_PUBLIC_SITE_URL`. Apply migrations
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
   The consumer right rail (≥1024px) is the `@aside` parallel route: add
   `src/app/(consumer)/@aside/<route>/page.tsx` to give a page its own rail; otherwise the agent strip shows.
