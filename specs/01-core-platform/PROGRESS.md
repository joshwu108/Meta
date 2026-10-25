# Workstream 01 — Progress

Branch: `ws/01-core`. Source of truth: [`specs.md`](./specs.md) and [`../README.md`](../README.md).

## P0 checklist (unblocks other workstreams first)

- [x] Repo scaffold: Next.js 15 App Router, TypeScript strict, Tailwind, pnpm scripts (`dev`, `db:*`, `test`, `test:e2e`, `lint`, `typecheck`)
- [x] `src/shared/enums.ts` with every enum from README §2
- [x] `src/shared/types.ts` with the cross-workstream types from specs §4
- [x] `src/shared/schemas/*` baseline (profile, notification, agent action log)
- [x] `src/lib/api`: `ok`, `fail`, `ApiError`, `parseBody`, `withAuth`, `withBusinessOwner` (TSDoc)
- [x] `src/lib/log.ts` structured JSON logging with PII redaction
- [x] `src/lib/ai`: `generateStructured`, `chat`, `PromptId` registry, `MOCK_AI` fixtures
- [x] `src/lib/supabase`: `server.ts`, `client.ts`, `admin.ts` (server-only), `database.types.ts`
- [x] Supabase local config + migration `0100_core.sql` (tables, trigger, signup hook, RLS, `profile_public_cards`)
- [x] `src/features/core`: `notify`, `logAgentAction`, `getCurrentUser`, `index.ts`
- [x] `src/styles/tokens.css` light + dark per design-system §1–2
- [x] UI primitives: Button, Chip, AiTag, AiRing, Avatar, Card, Sheet, Switch, Tabs, StatusPill, CapacityMeter, Toast, EmptyState
- [x] App shell: consumer frame (top bar, left rail, right rail, bottom tabs), business frame, `NotificationBell`
- [x] Auth: `/login`, `/signup` (+ `?as=business`), magic link, sign out, middleware session refresh, `/` redirects
- [x] Routes: `GET/PATCH /api/me`, `GET /api/notifications`, `PATCH /api/notifications/:id/read`, `POST /api/dev/seed`
- [x] Seed runner + fixtures (15 users, 3 businesses, 6 events, 2 groups), idempotent
- [x] `/dev/theme` page rendering every primitive in both themes
- [x] Security headers + CSP in `next.config.ts`
- [x] `.env.example`, README quick start
- [x] GitHub Actions CI: lint → typecheck → unit/integration → Playwright smoke (`MOCK_AI=1`)

## Tests (specs §9)

- [x] Unit: envelope helpers
- [x] Unit: `parseBody` returns `VALIDATION` with field paths
- [x] Unit: `generateStructured` retries once then throws `AI_UNAVAILABLE`
- [x] Unit: `MOCK_AI` returns fixture
- [x] Unit: log redaction
- [x] Unit: Zod row schemas satisfy generated DB row types
- [x] Integration: signup creates profile row
- [x] Integration: profile RLS blocks reading another user's row
- [x] Integration: `profile_public_cards` hides non-discoverable users
- [x] Integration: `notify()` inserts; user can list and mark read
- [x] Integration: business owner cannot select from `profiles`
- [x] E2E: signup → onboarding redirect
- [x] E2E: login → discover
- [x] E2E: notification bell shows unread count
- [x] E2E: `/dev/theme` screenshots 320/768/1024/1440 light + dark
- [x] CI guard: every public table has RLS
- [x] CI guard: migrations apply on fresh reset
- [x] CI guard: `pnpm db:types` output committed and current

## Acceptance criteria (specs §10)

- [x] AC1 fresh clone → `pnpm i && pnpm db:start && pnpm db:reset && pnpm db:seed && pnpm dev` works
- [x] AC2 seeded consumer and business owner log in and see their shells
- [x] AC3 shared helpers/types exported with TSDoc
- [ ] AC4 CI green with §9 guards (workflow now runs on main; result needs a human to read)
- [ ] AC5 preview deployment with `MOCK_AI=1` `DEMO_MODE=1`

## P1

- [x] Dark-mode toggle UI
- [x] Per-user in-memory rate guard on AI routes
- [x] Coverage ≥ 80% on `src/features/core/server`

## Decisions

- 2026-10-24: `src/shared/types.ts` now follows the owning specs where they differ from the README baseline: `SharablePreferences.interestCategories: EventCategory[]`, `groupSizePref: GroupSizePref | null`, and `ExplainInput = { viewer, target, breakdown }` (spec 02 §5; 03 and 06 already code against it). README §4 needs the same edit (Needs from others).
- 2026-10-24: `users.json` has 16 users (added `jordan@weave.test` for Scene 6 per spec 06 §8); spec 01 §6 updated; README §5 still says 15.
- 2026-10-24: Prompt definitions are split into `src/lib/ai/prompts/{agent,groups,demand,events}.ts` and spread into `PROMPTS`; seed extensions register in `supabase/seed/loaders/registry.ts`. Both exist so other workstreams' merges add lines instead of conflicting.

- 2026-10-24: Added `--color-warning-ink` (#8A5A00 light / #F7B928 dark) to tokens.css because the spec's `--color-warning` (#F7B928) on `--color-warning-soft` fails AA for text. Used by `StatusPill` amber states. Proposed for design-system.md under Needs from others.
- 2026-10-24: Dev server and Playwright default to port 3100 (3000 is commonly held by Docker/other tools); `PORT` overrides.
- 2026-10-24: Screenshot baselines are per platform (`-darwin`, `-linux`); CI writes missing baselines on its first run rather than failing on macOS ones.

- 2026-10-24: Supabase CLI is not installed globally on this machine; it is added as a devDependency so `pnpm supabase ...` works everywhere and in CI.

## Needs from others

- 02: `Chip` takes `label` (remove button reads "Remove <label>") and `Switch` takes `labelledBy`/`describedBy` (renders only the control when `label` is omitted); `server-only` is aliased in every vitest project and `integration` sets `MOCK_AI=1`. You can drop the local Chip/Switch and the alias on merge. Your edit to the onboarding e2e test is fine; keep it.
- 06 (and 02/03): the consumer right rail is now the `@aside` parallel route; add `src/app/(consumer)/@aside/discover/page.tsx` (agent strip) and `@aside/events/page.tsx` (filters) to own those rails. Everything else keeps the default agent strip.
- All: notification `payload.href` (in-app path) is now honoured by the bell; `payload.title` and `payload.body` override the default copy.
- ~~README (integrator): §4 `SharablePreferences` / `ExplainInput`, §5 16 users~~ applied on main (67c7e8a).
- 02: put your `AGENT_PROMPT_DEFINITIONS` in `src/lib/ai/prompts/agent.ts` as `AGENT_PROMPTS` (slot exists), and register `loadAgentPreferences` in `supabase/seed/loaders/registry.ts` `AFTER_USERS` (your `AgentSeedContext` is a subset of `SeedContext`, so it fits as-is).
- 03: put the `groups.plan_activities` definition in `src/lib/ai/prompts/groups.ts` as `GROUPS_PROMPTS`; register connections/invitations loaders in `AFTER_ALL`.
- 04: `DEMAND_PROMPTS` slot is `src/lib/ai/prompts/demand.ts`; keep that path.
- 06: register `loadRsvps` in `AFTER_EVENTS` yourself in the merge commit (your loader file is not on 01); `tests/db/support/{setup,global-setup}.ts` exist as placeholders for you to overwrite; `pnpm test:db` runs `tests/db/**` with `TEST_DATABASE_URL` defaulting to the local stack and `server-only` aliased to `tests/support/server-only.ts`; add `pg` to devDependencies in your merge.
- 02: `src/lib/ai/fixtures/agent.follow_up_suggestion.json` has no matching id in `src/lib/ai/prompts/index.ts`; add `'agent.follow_up_suggestion'` to `PROMPT_IDS` (and a `PROMPTS` entry) in your branch, or rename the fixture to `events.reconnect_followup` which is already registered.
- 05: `src/lib/api/client.ts` now exists in 01 with the surface your components import (`ApiClientError`, `apiGet/apiPost/apiPatch/apiDelete`, `fieldErrors`). Drop your copy on merge; `fieldErrors` accepts both `{ field, message }` and `{ path, message }`.
- ~~Integrator: `main` still contains only `specs/`~~ ws/01-core is on main as of 67c7e8a (fast-forward requested by the integrator). Remaining advice still applies: Branches 02/03/05/06 each carry their own `package.json`, `supabase/seed/seed.ts` and (05) `fixtures/businesses.json`, so merging 01 first and then resolving their seed/scaffold files in favour of 01's structure (`supabase/seed/runner.ts` + `loaders/`) will be the least painful order. 03 already copied 01's seed layout.
- 05: `supabase/seed/fixtures/businesses.json` on your branch has a different shape from the base fixture; keep the base fields (`slug, name, category, neighborhood, address, description, lat, lng, capacity, owner`) and extend `loaders/domain.ts` for hours/capabilities rather than replacing the runner.
- 06: your `supabase/seed/06-events.ts` should become a loader under `supabase/seed/loaders/` called from `runner.ts` after `loadEvents`.
- ~~README/design-system (integrator): add `--color-warning-ink`~~ applied on main (67c7e8a).
- 03/05/06: `supabase/seed/loaders/domain.ts` inserts `businesses`, `events`, `groups`, `group_members` with the column names from your specs and skips while the table is missing. When your migration lands, run `pnpm db:seed` and adjust the loader for any column it gets wrong.
- 05: `withBusinessOwner` looks up `businesses` by `owner_id = auth.uid()`. Keep that column name (or tell me the real one).

## Blocked

- AC4 (CI green): the workflow is committed and runs on every push to `ws/**`, but this machine has no `gh` and the worker may not log in, so the run result cannot be read from here. A human should open the Actions tab once; failures there will be fixed on the next wakeup if they are reported in Needs-from-others or main.

- AC5 (Vercel preview + hosted Supabase) needs project credentials a human must create. Everything else is built so that linking the projects is the only remaining step.

## Log

- 2026-10-24 19:40 — Wakeup: main unchanged; 02/03/04/05 merged main into their branches, 03 reports all three CI jobs green with 01's workflow. Landed 02's asks: Chip remove labels, Switch external labelling, server-only alias in unit/integration, MOCK_AI pinned for integration. 80 unit + 17 integration + 17 e2e green. Next: watch main.
- 2026-10-24 19:20 — Wakeup: main unchanged since the 01 merge. 06 merged main into its branch and reports CI lint/typecheck/unit green on its PR (my workflow works; its Supabase job waits on 05). Landed 06's request: `@aside` parallel-route slot for the consumer right rail (default + catch-all → agent strip). 79 unit + 17 integration + 17 e2e green. Next: watch main.
- 2026-10-24 18:50 — Integrator asked for ws/01-core on main: fast-forwarded main to 5766791, then to integration/ws01 (67c7e8a: Node 22 `.npmrc` + README/design-system contract edits applying this file's requests). Branch synced to main. Scripts verified on the pinned Node 22.20.0: typecheck clean, 79 unit green. Next: other workstreams merge onto this; keep syncing and reconcile their changes to shared files.
- 2026-10-24 18:20 — Wakeup: main unchanged. Bell rows now follow `payload.href` (03's request): safeNext-validated, mark read first, then navigate; seed notifications carry hrefs. 79 unit + 17 integration + 16 e2e green. Next: watch main.
- 2026-10-24 18:05 — Check: main unchanged; all five branches moved. Added `demand.revise_proposal` (04). Re-verified all 13 branch migrations (0100–0600 incl. 0302/0303/0402–0404) apply together locally; seed + 17 integration tests pass. 03 and 06 have written merge plans against 01's registries. Next: watch main.
- 2026-10-24 17:55 — Wakeup: main unchanged. Verified all six workstreams' real migrations (0100–0600) apply together locally; seed and 17 integration tests pass (not committed). Fixed the 320px TopBar overflow 03 reported (+ shell e2e), widened coverage include to src/features/*/server (04), seated 06's db setup/global-setup files. 79 unit + 17 integration + 16 e2e green. Next: watch main.
- 2026-10-24 17:35 — Wakeup: main unchanged; read every branch's Needs-from-others for 01. Landed: shared types aligned to spec 02 (interestCategories, nullable groupSizePref, ExplainInput), prompt registry split per workstream (+agent.follow_up_suggestion, groups.plan_activities), seed loader registry (AFTER_USERS/AFTER_EVENTS/AFTER_ALL), jordan@ fixture, `db` vitest project. 79 unit + 17 integration + 14 e2e green. Next: watch main.
- 2026-10-24 17:15 — Compared 02/03/05/06 branches' shared files against 01: enums/types/prompt registry are byte-equivalent in meaning (copied from README). Adopted 05's browser envelope client into `src/lib/api/client.ts` with tests; bell and onboarding button use it. 83 unit + 17 integration + 14 e2e green. Next: watch main.
- 2026-10-24 17:00 — Wakeup: main unchanged, but ws/02, 03, 05, 06 branches now exist. Read their migrations (never merged them): aligned seed loaders to `businesses` (no capacity column → `business_capabilities`) and `groups.creator_id`; column drift on foreign tables now skips instead of aborting. Verified by temporarily applying 0300/0301/0500/0501/0600 locally: seed inserts 3 businesses, 6 events, 2 groups; 17 integration tests incl. RLS guard pass. Next: keep watching main.
- 2026-10-24 16:45 — Wakeup: main unchanged. Seeded owners carry signup_as=business so / routes them to the business side; owner e2e tightened; supabase config deprecation fixed. All suites green. Next: keep syncing for other workstreams' migrations.
- 2026-10-24 16:40 — Code + security review pass: fixed backslash open redirect (shared safeNext), business signup with email confirmation landing in consumer onboarding, middleware dropping query strings, mark-read overwriting read_at, seed deletion skipping pages. 77 unit + 15 integration + 14 e2e green. Next: idle list; watch main for other workstreams' migrations.
- 2026-10-24 16:25 — Production build passes (103 kB first load, all files < 220 lines). Design-system pass: warning ink token, feed stagger, capacity meter mount animation, no color literals outside tokens.css. Seed route production guard tested. README now has a per-workstream module guide. 72 unit + 15 integration + 14 e2e green. Next: idle list (periodic sync for other workstreams' tables; adjust seed loaders when they land).
- 2026-10-24 16:05 — Clean-state check green (db reset → seed → 62 vitest → 14 e2e). Added `aiRateLimiter` (20/min per user) exported from `src/lib/api`, plus unit tests for auth actions, getCurrentUser, withBusinessOwner, seed wrapper and integration tests for profile helpers: 86 tests, core/server at 90% statements. Next: design-system checklist pass (warning ink token, feed stagger), then idle list.
- 2026-10-24 15:50 — Integration tests (RLS, notify/logAgentAction, seed idempotency, RLS guard) and Playwright smoke (signup→onboarding, login→discover, bell unread, theme gallery 4 widths × 2 themes) green locally; CI workflow + README landed; nav icon serialization fix. Totals: 47 unit, 15 integration, 14 e2e. Next: clean-state check (db reset + seed + all suites), coverage on features/core/server, rate guard on AI routes.
- 2026-10-24 15:35 — Scaffold, shared enums/types/schemas, API envelope + withAuth, logger, Claude wrapper with MOCK_AI, migration 0100 + RLS + generated types, notify/logAgentAction, tokens + 14 UI primitives, app shell, auth pages, /api/me + /api/notifications + /api/dev/seed, seed runner (15 users, 3 owners, 4 notifications; business/event/group tables skipped until their migrations land), 47 unit tests green, typecheck + lint green. Next: integration tests against local supabase, Playwright smoke + theme screenshots, CI workflow, README quick start.

- 2026-10-24 15:15 — PROGRESS.md created; repo contains specs only. Next: scaffold + shared types + envelope.
