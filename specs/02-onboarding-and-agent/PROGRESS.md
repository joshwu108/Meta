# Workstream 02 — Progress

Branch: `ws/02-agent` · Owner: Tanish Patro

## Checklist

### Foundations (unblock others first)
- [x] Migration `supabase/migrations/0200_agent.sql` (tables, RLS, triggers)
- [x] Zod schemas: `UserPreferences`, `ExtractedPreferences`, `Consent`, `SuggestionCard`, chat request/response
- [x] `src/features/agent/index.ts` exports `getSharablePreferences()` and `explainRecommendation()`
- [x] MOCK_AI fixtures: `agent.extract_preferences`, `agent.chat`, `agent.explain_recommendation`, `agent.follow_up_suggestion`

### P0 server
- [x] Time-phrase → availability slot mapping
- [x] Onboarding loop (extract → follow-up ≤3 → review), writes `ai_inferred` sources
- [x] Confirm flips fields to `user_set`, sets `onboarding_completed_at` + `is_discoverable`
- [x] `getSharablePreferences` consent gating, private-field stripping, batched log row
- [x] `explainRecommendation` with highlight grounding post-check
- [x] Per-user rate limiter (30 calls / 10 min)
- [x] Chat capabilities (`suggest_people`, `suggest_events`, `suggest_groups`, `update_preference`) with stubs for 03/06

### P0 API
- [x] `POST /api/users/onboard`
- [x] `POST /api/agent/chat`
- [x] `GET/PATCH /api/agent/preferences`
- [x] `POST /api/agent/preferences/confirm`
- [x] `GET/PATCH /api/agent/permissions`
- [x] `GET /api/agent/log`

### P0 UI
- [x] `/onboarding` 3 steps (basics, talk, review)
- [x] `/agent` chat with suggestion cards + "Why this?"
- [x] `/agent/preferences` editor with AI-inferred badges and delete
- [x] `/agent/permissions` consent switches
- [x] Agent action log view

### Seed
- [x] `supabase/seed/fixtures/preferences.json` (14 users, demo clusters, one demand opt-out)

### Tests (spec section 9)
- [x] Unit: time-phrase → slot table
- [x] Unit: Zod rejects unknown enum values
- [x] Unit: `getSharablePreferences` null per consent flag, strips private fields
- [x] Unit: explanation post-check drops ungrounded highlights
- [x] Unit: rate limiter
- [ ] Integration (MOCK_AI): onboarding chat writes `ai_inferred` fields
- [ ] Integration: confirm flips to `user_set` and sets `onboarding_completed_at`
- [ ] Integration: PATCH preferences respects RLS
- [ ] Integration: agent log row written when preferences shared
- [x] Prompt eval set: 10 transcripts in `tests/evals/agent/*.json` (running it needs a live key)
- [x] E2E Scene 1 (UI path with /api intercepted by the MOCK_AI fixture; full-stack run waits on 01 + Docker)

### Acceptance criteria (spec section 10)
- [x] AC1 Scene 1 sentence → pottery, coffee, thu_eve, small; nothing invented (service test + Playwright UI test)
- [ ] AC2 Deleting an inferred value persists (service-level test passes; DB-backed check waits on Docker)
- [ ] AC3 Consent off → excluded from matching / demand (shared fixture)
- [x] AC4 Suggestion cards deep-link and show "Why this?"
- [ ] AC5 Activity log entry per sharing purpose

### P1
- [x] Group scheduling conflict helper
- [x] `agent.follow_up_suggestion` for 06
- [x] Feedback memory (thumbs up/down injected into prompts)

## Decisions
- 2026-10-24: Workstream 01 has not pushed a scaffold yet. To run tests I add the minimum root tooling (package.json, tsconfig, vitest) and the README-verbatim `src/shared/enums.ts` / `types.ts`. Core helpers (`ok`/`fail`/`withAuth`, `generateStructured`, `logAgentAction`) are stubbed in `src/features/agent/server/stubs.ts` with the exact 01 signatures. Main wins on every one of these files when 01 lands.
- 2026-10-24: Scene 1 Playwright test intercepts `/api/**` with the same MOCK_AI fixture, so the UI path is verified without Supabase. A full-stack variant replaces the intercepts once auth and the DB exist.
- 2026-10-24: Share logging writes one `agent_action_log` row per shared user per purpose, inserted in one statement per call and deduped within 1 hour. A single batch row with `user_id null` would hide the entry from the user's own log (AC5).
- 2026-10-24: `SharablePreferences.groupSizePref` is non-null in the contract; when the user never stated one, ws02 returns `'small'`.
- 2026-10-24: Anti-invention guard (`groundExtraction`): availability slots whose day the user never typed and budgets nobody stated are dropped server-side, and slots the deterministic phrase mapper finds are added. Interests below 0.5 confidence are dropped.
- 2026-10-24: `index.ts` also exports `getSharablePreferencesBatch(userIds, purpose)` for 03/04 pipelines (one query and one log insert per call).
- 2026-10-24: Service logic is unit-tested against an in-memory repo (`tests/unit/agent/fake-repo.ts`) while Docker is unavailable; the DB-backed integration rows stay open.
- 2026-10-24: Node 20.18.1 and pnpm 9.15.0 installed under ~/.local (no Homebrew on this machine).

## Needs from others
- README: add `POST /api/agent/feedback` (P1) to the 02 row of the routes table, and `resolveGroupSchedule(members)` / `getSharablePreferencesBatch(ids, purpose)` to the 02 function contracts.
- 03: the group planner can call `resolveGroupSchedule(members)` from `@/features/agent` with members fetched via `getSharablePreferencesBatch(ids, 'group_plan')`.
- 01: `users.json` should use the emails in `supabase/seed/fixtures/preferences.json` (maya@, jordan@, … @commonground.test) and call `seedAgent(admin, userIdByEmail)` from `supabase/seed/agent.ts` after users are inserted.
- 01: until the app shell lands, ws02 ships `src/styles/tokens.css` (copied from design-system.md), a bare `src/app/layout.tsx`, and local primitives in `features/agent/components/primitives.tsx`. Replace them with 01's versions on merge.
- README/01: `SharablePreferences.groupSizePref` is non-null but users may not state one; ws02 returns `'small'` when unset. Prefer making it `GroupSizePref | null`.
- 01: `profiles`, `agent_action_log`, `set_updated_at()` from `0100_core.sql`; `src/lib/api`, `src/lib/ai`, `logAgentAction`, `getCurrentUser`.

## Blocked
- Running the live prompt eval (`pnpm tsx tests/evals/agent/run.ts`) needs `ANTHROPIC_API_KEY`; the set itself is committed and checked in CI.
- Even with Docker, `0200_agent.sql` needs 01's `0100_core.sql` (`profiles`, `agent_action_log`, `set_updated_at()`), which is not on main yet.
- Docker is not installed on this machine, so `supabase start` / `db reset` cannot run. Integration tests, the E2E scene and the full clean-state check wait on a human installing Docker Desktop.

## Log
- 2026-10-24 15:31 · landed: progress checklist, tooling, 0200 migration, schemas, time-slot mapper, consent boundary core (37 unit tests). Next: explainRecommendation, rate limiter, onboarding loop, MOCK_AI fixtures.
- 2026-10-24 15:45 · landed: explanations with grounding, rate limiter, extraction merge + anti-invention guard, MOCK_AI fixtures + prompts, repo, onboarding/preferences/chat services, index exports, follow-up suggestion (85 unit tests). Next: API routes, then UI.
- 2026-10-24 16:05 · landed: 6 API routes (+ route tests), preferences seed + loader, tokens/layout, onboarding/agent/preferences/permissions/log screens; `pnpm build` green, 99 unit tests. Next: component tests, eval transcripts, Playwright Scene 1 spec (runs once Docker exists).
- 2026-10-24 16:15 · landed: slot mapper per-clause fix, 10-transcript eval set + live runner, repo + follow-up tests; 114 unit tests, 95% line coverage on features/agent/server. Next: DB integration tests (auto-skip without Supabase), Playwright Scene 1 spec, UI component tests.
- 2026-10-24 16:25 · landed: Supabase integration tests (auto-skip), Playwright Scene 1 (passing). Next: P1 feedback memory and group scheduling helper, UI component tests.
- 2026-10-24 16:40 · landed: P1 group scheduling helper, P1 feedback memory (route, storage, prompt injection, thumbs UI); 123 unit tests + Scene 1 E2E green. Next: AC3 shared consent fixture for 03/04, UI polish, dark-mode screenshots.
