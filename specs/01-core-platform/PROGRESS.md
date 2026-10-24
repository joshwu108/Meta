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
- [ ] `.env.example`, README quick start
- [ ] GitHub Actions CI: lint → typecheck → unit/integration → Playwright smoke (`MOCK_AI=1`)

## Tests (specs §9)

- [x] Unit: envelope helpers
- [x] Unit: `parseBody` returns `VALIDATION` with field paths
- [x] Unit: `generateStructured` retries once then throws `AI_UNAVAILABLE`
- [x] Unit: `MOCK_AI` returns fixture
- [x] Unit: log redaction
- [x] Unit: Zod row schemas satisfy generated DB row types
- [ ] Integration: signup creates profile row
- [ ] Integration: profile RLS blocks reading another user's row
- [ ] Integration: `profile_public_cards` hides non-discoverable users
- [ ] Integration: `notify()` inserts; user can list and mark read
- [ ] Integration: business owner cannot select from `profiles`
- [ ] E2E: signup → onboarding redirect
- [ ] E2E: login → discover
- [ ] E2E: notification bell shows unread count
- [ ] E2E: `/dev/theme` screenshots 320/768/1024/1440 light + dark
- [ ] CI guard: every public table has RLS
- [ ] CI guard: migrations apply on fresh reset
- [ ] CI guard: `pnpm db:types` output committed and current

## Acceptance criteria (specs §10)

- [ ] AC1 fresh clone → `pnpm i && pnpm db:start && pnpm db:reset && pnpm db:seed && pnpm dev` works
- [ ] AC2 seeded consumer and business owner log in and see their shells
- [ ] AC3 shared helpers/types exported with TSDoc
- [ ] AC4 CI green with §9 guards
- [ ] AC5 preview deployment with `MOCK_AI=1` `DEMO_MODE=1`

## P1

- [ ] Dark-mode toggle UI
- [ ] Per-user in-memory rate guard on AI routes
- [ ] Coverage ≥ 80% on `src/features/core/server`

## Decisions

- 2026-10-24: Supabase CLI is not installed globally on this machine; it is added as a devDependency so `pnpm supabase ...` works everywhere and in CI.

## Needs from others

- 03/05/06: `supabase/seed/loaders/domain.ts` inserts `businesses`, `events`, `groups`, `group_members` with the column names from your specs and skips while the table is missing. When your migration lands, run `pnpm db:seed` and adjust the loader for any column it gets wrong.
- 05: `withBusinessOwner` looks up `businesses` by `owner_id = auth.uid()`. Keep that column name (or tell me the real one).

## Blocked

- AC5 (Vercel preview + hosted Supabase) needs project credentials a human must create. Everything else is built so that linking the projects is the only remaining step.

## Log

- 2026-10-24 15:35 — Scaffold, shared enums/types/schemas, API envelope + withAuth, logger, Claude wrapper with MOCK_AI, migration 0100 + RLS + generated types, notify/logAgentAction, tokens + 14 UI primitives, app shell, auth pages, /api/me + /api/notifications + /api/dev/seed, seed runner (15 users, 3 owners, 4 notifications; business/event/group tables skipped until their migrations land), 47 unit tests green, typecheck + lint green. Next: integration tests against local supabase, Playwright smoke + theme screenshots, CI workflow, README quick start.

- 2026-10-24 15:15 — PROGRESS.md created; repo contains specs only. Next: scaffold + shared types + envelope.
