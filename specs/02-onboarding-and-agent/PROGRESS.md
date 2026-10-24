# Workstream 02 — Progress

Branch: `ws/02-agent` · Owner: Tanish Patro

## Checklist

### Foundations (unblock others first)
- [x] Migration `supabase/migrations/0200_agent.sql` (tables, RLS, triggers)
- [x] Zod schemas: `UserPreferences`, `ExtractedPreferences`, `Consent`, `SuggestionCard`, chat request/response
- [ ] `src/features/agent/index.ts` exports `getSharablePreferences()` and `explainRecommendation()`
- [ ] MOCK_AI fixtures: `agent.extract_preferences`, `agent.chat`, `agent.explain_recommendation`, `agent.follow_up_suggestion`

### P0 server
- [x] Time-phrase → availability slot mapping
- [ ] Onboarding loop (extract → follow-up ≤3 → review), writes `ai_inferred` sources
- [ ] Confirm flips fields to `user_set`, sets `onboarding_completed_at` + `is_discoverable`
- [ ] `getSharablePreferences` consent gating, private-field stripping, batched log row
- [ ] `explainRecommendation` with highlight grounding post-check
- [ ] Per-user rate limiter (30 calls / 10 min)
- [ ] Chat capabilities (`suggest_people`, `suggest_events`, `suggest_groups`, `update_preference`) with stubs for 03/06

### P0 API
- [ ] `POST /api/users/onboard`
- [ ] `POST /api/agent/chat`
- [ ] `GET/PATCH /api/agent/preferences`
- [ ] `POST /api/agent/preferences/confirm`
- [ ] `GET/PATCH /api/agent/permissions`
- [ ] `GET /api/agent/log`

### P0 UI
- [ ] `/onboarding` 3 steps (basics, talk, review)
- [ ] `/agent` chat with suggestion cards + "Why this?"
- [ ] `/agent/preferences` editor with AI-inferred badges and delete
- [ ] `/agent/permissions` consent switches
- [ ] Agent action log view

### Seed
- [ ] `supabase/seed/fixtures/preferences.json` (14 users, demo clusters, one demand opt-out)

### Tests (spec section 9)
- [x] Unit: time-phrase → slot table
- [x] Unit: Zod rejects unknown enum values
- [x] Unit: `getSharablePreferences` null per consent flag, strips private fields
- [ ] Unit: explanation post-check drops ungrounded highlights
- [ ] Unit: rate limiter
- [ ] Integration (MOCK_AI): onboarding chat writes `ai_inferred` fields
- [ ] Integration: confirm flips to `user_set` and sets `onboarding_completed_at`
- [ ] Integration: PATCH preferences respects RLS
- [ ] Integration: agent log row written when preferences shared
- [ ] Prompt eval set: 10 transcripts in `tests/evals/agent/*.json` (running it needs a live key)
- [ ] E2E Scene 1

### Acceptance criteria (spec section 10)
- [ ] AC1 Scene 1 sentence → pottery, coffee, thu_eve, small; nothing invented
- [ ] AC2 Deleting an inferred value persists
- [ ] AC3 Consent off → excluded from matching / demand (shared fixture)
- [ ] AC4 Suggestion cards deep-link and show "Why this?"
- [ ] AC5 Activity log entry per sharing purpose

### P1
- [ ] Group scheduling conflict helper
- [ ] `agent.follow_up_suggestion` for 06
- [ ] Feedback memory (thumbs up/down injected into prompts)

## Decisions
- 2026-10-24: Workstream 01 has not pushed a scaffold yet. To run tests I add the minimum root tooling (package.json, tsconfig, vitest) and the README-verbatim `src/shared/enums.ts` / `types.ts`. Core helpers (`ok`/`fail`/`withAuth`, `generateStructured`, `logAgentAction`) are stubbed in `src/features/agent/server/stubs.ts` with the exact 01 signatures. Main wins on every one of these files when 01 lands.

## Needs from others
- README/01: `SharablePreferences.groupSizePref` is non-null but users may not state one; ws02 returns `'small'` when unset. Prefer making it `GroupSizePref | null`.
- 01: `profiles`, `agent_action_log`, `set_updated_at()` from `0100_core.sql`; `src/lib/api`, `src/lib/ai`, `logAgentAction`, `getCurrentUser`.

## Blocked
- Docker is not installed on this machine, so `supabase start` / `db reset` cannot run. Integration tests, the E2E scene and the full clean-state check wait on a human installing Docker Desktop.

## Log
- 2026-10-24 15:31 · landed: progress checklist, tooling, 0200 migration, schemas, time-slot mapper, consent boundary core (37 unit tests). Next: explainRecommendation, rate limiter, onboarding loop, MOCK_AI fixtures.
