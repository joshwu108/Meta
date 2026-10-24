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
- [ ] AC4 CI green with §9 guards
- [ ] AC5 preview deployment with `MOCK_AI=1` `DEMO_MODE=1`

## P1

- [x] Dark-mode toggle UI
- [x] Per-user in-memory rate guard on AI routes
- [x] Coverage ≥ 80% on `src/features/core/server`

## Decisions

- 2026-10-24: Added `--color-warning-ink` (#8A5A00 light / #F7B928 dark) to tokens.css because the spec's `--color-warning` (#F7B928) on `--color-warning-soft` fails AA for text. Used by `StatusPill` amber states. Proposed for design-system.md under Needs from others.
- 2026-10-24: Dev server and Playwright default to port 3100 (3000 is commonly held by Docker/other tools); `PORT` overrides.
- 2026-10-24: Screenshot baselines are per platform (`-darwin`, `-linux`); CI writes missing baselines on its first run rather than failing on macOS ones.

- 2026-10-24: Supabase CLI is not installed globally on this machine; it is added as a devDependency so `pnpm supabase ...` works everywhere and in CI.

## Needs from others

- README/design-system (integrator): add `--color-warning-ink` to design-system.md §1 (see Decisions) so other workstreams use it for text on `--color-warning-soft`.
- 03/05/06: `supabase/seed/loaders/domain.ts` inserts `businesses`, `events`, `groups`, `group_members` with the column names from your specs and skips while the table is missing. When your migration lands, run `pnpm db:seed` and adjust the loader for any column it gets wrong.
- 05: `withBusinessOwner` looks up `businesses` by `owner_id = auth.uid()`. Keep that column name (or tell me the real one).

## Blocked

- AC4 (CI green): the workflow is committed and runs on every push to `ws/**`, but this machine has no `gh` and the worker may not log in, so the run result cannot be read from here. A human should open the Actions tab once; failures there will be fixed on the next wakeup if they are reported in Needs-from-others or main.

- AC5 (Vercel preview + hosted Supabase) needs project credentials a human must create. Everything else is built so that linking the projects is the only remaining step.

## Log

- 2026-10-24 16:40 — Code + security review pass: fixed backslash open redirect (shared safeNext), business signup with email confirmation landing in consumer onboarding, middleware dropping query strings, mark-read overwriting read_at, seed deletion skipping pages. 77 unit + 15 integration + 14 e2e green. Next: idle list; watch main for other workstreams' migrations.
- 2026-10-24 16:25 — Production build passes (103 kB first load, all files < 220 lines). Design-system pass: warning ink token, feed stagger, capacity meter mount animation, no color literals outside tokens.css. Seed route production guard tested. README now has a per-workstream module guide. 72 unit + 15 integration + 14 e2e green. Next: idle list (periodic sync for other workstreams' tables; adjust seed loaders when they land).
- 2026-10-24 16:05 — Clean-state check green (db reset → seed → 62 vitest → 14 e2e). Added `aiRateLimiter` (20/min per user) exported from `src/lib/api`, plus unit tests for auth actions, getCurrentUser, withBusinessOwner, seed wrapper and integration tests for profile helpers: 86 tests, core/server at 90% statements. Next: design-system checklist pass (warning ink token, feed stagger), then idle list.
- 2026-10-24 15:50 — Integration tests (RLS, notify/logAgentAction, seed idempotency, RLS guard) and Playwright smoke (signup→onboarding, login→discover, bell unread, theme gallery 4 widths × 2 themes) green locally; CI workflow + README landed; nav icon serialization fix. Totals: 47 unit, 15 integration, 14 e2e. Next: clean-state check (db reset + seed + all suites), coverage on features/core/server, rate guard on AI routes.
- 2026-10-24 15:35 — Scaffold, shared enums/types/schemas, API envelope + withAuth, logger, Claude wrapper with MOCK_AI, migration 0100 + RLS + generated types, notify/logAgentAction, tokens + 14 UI primitives, app shell, auth pages, /api/me + /api/notifications + /api/dev/seed, seed runner (15 users, 3 owners, 4 notifications; business/event/group tables skipped until their migrations land), 47 unit tests green, typecheck + lint green. Next: integration tests against local supabase, Playwright smoke + theme screenshots, CI workflow, README quick start.

- 2026-10-24 15:15 — PROGRESS.md created; repo contains specs only. Next: scaffold + shared types + envelope.
