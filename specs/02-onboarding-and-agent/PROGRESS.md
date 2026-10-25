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
- [x] Integration (MOCK_AI): onboarding chat writes `ai_inferred` fields — verified 2026-10-24 against local Supabase on a throwaway merge with ws/01-core @ 67e4f12 (`agent-db.test.ts`); rerun after main sync
- [x] Integration: confirm flips to `user_set` and sets `onboarding_completed_at` — verified 2026-10-24 against local Supabase on a throwaway merge with ws/01-core @ 67e4f12 (`agent-db.test.ts`); rerun after main sync
- [x] Integration: PATCH preferences respects RLS (PGlite: 0200 on 0100 core, cross-user select/update/insert blocked; Supabase-stack variant still skipped)
- [x] Integration: agent log row written when preferences shared — verified 2026-10-24 against local Supabase on a throwaway merge with ws/01-core @ 67e4f12 (`agent-db.test.ts`); rerun after main sync
- [x] Prompt eval set: 10 transcripts in `tests/evals/agent/*.json` (running it needs a live key)
- [x] E2E Scene 1 (UI path with /api intercepted by the MOCK_AI fixture; full-stack run waits on 01 + Docker)

### Acceptance criteria (spec section 10)
- [x] AC1 Scene 1 sentence → pottery, coffee, thu_eve, small; nothing invented (service test + Playwright UI test)
- [x] AC2 Deleting an inferred value persists — verified 2026-10-24 against local Supabase on a throwaway merge with ws/01-core @ 67e4f12 (`agent-db.test.ts`); rerun after main sync
- [ ] AC3 Consent off → excluded from matching / demand (shared fixture) — ws02 side done: `tests/fixtures/consent-cases.ts` + boundary test; needs 03/04 to assert against it
- [x] AC4 Suggestion cards deep-link and show "Why this?" — people cards use real consented users (`server/people.ts`), verified by `tests/e2e/agent-chat.spec.ts`; event/group cards still point at stub ids until 06/03 land
- [x] AC5 Activity log entry per sharing purpose — verified 2026-10-24 against local Supabase on a throwaway merge with ws/01-core @ 67e4f12 (`agent-db.test.ts`); rerun after main sync

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
- 2026-10-24: Onboarding replies are returned whole, not streamed. MOCK_AI and structured tool output make streaming moot for the demo; extracted chips still appear as soon as each reply lands. Revisit if live latency is a problem.

- 2026-10-24 (main sync): main wins on tooling and shared files; ws02 keeps its onboarding/agent pages. Agent prompts live in 01's `src/lib/ai/prompts/agent.ts` slot (`features/agent/server/prompts.ts` re-exports them); `generateStructured` no longer takes a per-call `system`.
- 2026-10-24 (main sync): 01's mock loader returns a fixture's top level only. App code uses it as is (Scene 1 is the top level); unit tests that need a specific `cases` entry mock `@/lib/ai` with `tests/unit/agent/mock-ai.ts`.
- 2026-10-24 (main sync): agent E2E is now full stack (real login via 01's helpers, real API + DB, MOCK_AI); only the AI-down test intercepts `/api/agent/chat`.

## Merge plan for when ws/01-core lands on main
(Status 2026-10-24: all steps done. Step 7: Button, AiTag, AiRing now come from `@/features/core/components/ui`; Chip, ToggleChip, Switch stay local, see Needs from others. Agent pages render inside 01's consumer AppShell via the `(consumer)` layout.)
Read-only review of `origin/ws/01-core` @ 43d5910 (not merged; ws02 syncs from main only):
1. Take main's root config (package.json, tsconfig, vitest, eslint, next.config, playwright.config, layout.tsx, tokens.css, shared/enums.ts, shared/types.ts); re-add ws02 dev deps (`zod-to-json-schema` only if 01 lacks it, `@playwright/test`).
2. Delete `src/features/agent/server/stubs.ts`; import `ok/fail/parseBody/withAuth/ApiError` from `@/lib/api`, `generateStructured` from `@/lib/ai`, `logAgentAction` from `@/features/core`, `createAdminClient` from `@/lib/supabase/admin`.
3. `generateStructured` has no `system` option in 01: drop per-call `system`, register `AGENT_PROMPT_DEFINITIONS` in `src/lib/ai/prompts/index.ts`.
4. 01's mock loader returns the whole fixture: ws02 fixtures already keep the default at the top level. Case-specific unit tests (board games, vague follow-ups) then need `vi.mock("@/lib/ai")` instead of relying on `cases`.
5. Consider replacing `server/rate-limit.ts` with 01's `createRateLimiter({ limit: 30, windowMs: 600000 })`.
6. Route tests: mock `@/lib/supabase/server` instead of `@supabase/ssr`; use 01's `EMPTY_CONTEXT`.
7. Swap local `primitives.tsx` for `@/features/core/components/ui` and wrap agent pages in 01's AppShell.
8. 01 ships a placeholder `src/app/(auth)/onboarding/page.tsx` ("owned by workstream 02") and an `AgentAside` rail stub: on conflict keep ws02's onboarding page, and point `AgentAside` at the agent's suggestions.
- 2026-10-24: RLS is tested on PGlite (Postgres in WASM) with a stubbed `auth` schema (`auth.users`, `auth.uid()` from `request.jwt.claim.sub`, `authenticated` role). The test uses main's `0100_core.sql` when present, else a stand-in that follows 01's spec.

## Integration findings (2026-10-24, tested with Docker)
Tested in a throwaway local merge of `origin/ws/02-agent` @ da4321e with `origin/ws/01-core` @ 67e4f12. Nothing was merged or pushed to main.
Results after the fixes below: 0100 + 0200 migrations apply on a fresh reset; 206/206 unit; 22/22 integration on Node 22 (including ws02's 5 DB tests); seed gives 14 `user_preferences`, 13 opted in to demand, 6 in the Scene 3 cluster (creative + thu_eve, Mission/Castro/Noe Valley). Scene 1 E2E was not run on the merged tree.

Owner: 01 / main integrator — status on main 2026-10-24: 1 done (00d54aa, Node 22); 2 partly (alias only in `db`; ws02 added it to unit/integration); 4 done via registry (ws02 registered its loader)
1. **Node 22 needed.** 01's resolved `@supabase/supabase-js` needs native WebSocket; on Node 20 the seed and every integration test fail ("native WebSocket not found"). Bump README §1, `engines` and CI to Node 22.
2. **`server-only` alias missing from 01's `vitest.config.ts`.** Without it 9 ws02 unit files fail to load. Add `'server-only': path.resolve(__dirname, 'tests/support/server-only.ts')` to `alias`. That fix alone took unit tests to 206/206.
4. **Preferences seed not wired.** 01's `runSeedWith` never calls `loadAgentPreferences(ctx)` (`supabase/seed/agent.ts`), so no preferences are seeded and 04's Scene 3 finds no demand. Call it right after `loadUsers(ctx)`; verified to work.

Owner: ws02 (after 01 lands on main) — done 2026-10-24 (db7b82e)
3. **23 type errors under 01's `noUncheckedIndexedAccess`.** Most in `tests/unit/agent/*.test.ts` (chat, consent-boundary, fixtures, group-schedule, repo); source in `server/extraction.ts:118` and `server/follow-up.ts:39`. Fix them in the sync merge.

ws02 sync procedure once 01 is on main (tested approach):
- Run `sync-main.sh`. 14 add/add conflicts: take main for `.gitignore`, `eslint.config.mjs`, `next.config.ts`, `package.json`, `playwright.config.ts`, `pnpm-lock.yaml`, `src/app/layout.tsx`, `src/shared/enums.ts`, `src/shared/types.ts`, `src/styles/tokens.css`, `tsconfig.json`, `vitest.config.ts`; keep ws02 for `src/app/(auth)/onboarding/page.tsx` and `src/app/(consumer)/agent/page.tsx`.
- Re-add dev deps `@testing-library/react@16.1.0` and `jsdom@25.0.1`.
- Fix item 3, then the merge plan above (stubs → 01 imports).
- Rerun on Node 22 from clean: `pnpm db:reset`, `pnpm db:seed`, `pnpm test`, `pnpm test:integration`, `pnpm typecheck`, `pnpm lint`, Scene 1 Playwright with `MOCK_AI=1`. Push to `ws/02-agent` only once all pass. Never push to main.

- 2026-10-24: `suggest_people` no longer uses placeholder people. Until 03's matches export lands it reads 01's `profile_public_cards` and filters through `getSharablePreferencesBatch(ids, "matching")` (so non-consenting or hidden users never appear), ranked by shared interests then slots. Default `agent.chat` fixture now requests people and events.

## Needs from others
- ~~01: `src/shared/types.ts` on ws/01-core has a placeholder `ExplainInput = { userId, subject, signals }`. 02 owns this type; please replace it with the shape in specs/02 §5 (`{ viewer, target, breakdown }`), which 06 already codes against.~~ Done on main (966a415).
- 01 / integrator: `vitest.config.ts` on main stubs `server-only` only in the `db` project. ws02 added the same alias to `unit` and `integration` (one `serverAlias` const) so 9 agent test files load; please keep it when merging ws02 (integration finding 2).
- 01 / integrator: `tests/e2e/auth.spec.ts` "a user without onboarding…" clicked 01's placeholder "Continue to Discover" button, which spec 02's onboarding replaces. ws02 changed that one test to assert the agent onboarding heading; finishing onboarding is covered by `agent-scene1.spec.ts`.
- 01: Playwright wrote Windows baselines for `theme.spec.ts` on first run here (`gallery-*-win32.png`); left uncommitted on this machine since 01 owns those baselines.
- 01: `ui/Chip` labels every remove button "Remove"; please use `Remove ${label}` (pass a `label` prop) so a row of chips has distinct accessible names, as spec 02 §7 and the Scene 1 E2E need. Then ws02 can drop its local Chip. Same for `ui/Switch`: accept `labelledBy`/`describedBy` for rows that render their own text.
- 03: when the matches export lands on main, swap `server/people.ts#suggestPeople` for it (keep the consent boundary). 06 / 03: swap `server/suggestion-stubs.ts` events and groups for `getRecommendedEvents` and the public groups export; their tables are not on main, so no guarded queries were added.
- 01: `tests/e2e/auth.spec.ts` "a seeded business owner is routed to the business side" is timing-flaky locally after other specs (blank `/` while dev compiles `/business/onboarding` past the 5s `toHaveURL` window); passes alone and in CI.
- 01: the `integration` vitest project sets no `MOCK_AI`; ws02's DB tests pin it in-file. Consider `env: { MOCK_AI: '1' }` on that project so no integration test can reach the live model.
- README: add `getAttendeeSharing(userIds)` and `getConsent(userId)` (requested by 06) to the 02 function contracts.
- 06: `getAttendeeSharing` and `getConsent` now exist on ws/02-agent with the exact shape of your stub; swap `stubs/agent.ts` for `@/features/agent` after both land on main.
- 03 and 04: import `DEMAND_OPT_OUT_EMAILS` / `MATCHING_OPT_OUT_EMAILS` from `tests/fixtures/consent-cases.ts` and assert those users never appear in matches / cohort counts (closes AC3).
- README: add `POST /api/agent/feedback` (P1) to the 02 row of the routes table, and `resolveGroupSchedule(members)` / `getSharablePreferencesBatch(ids, purpose)` to the 02 function contracts.
- 03: the group planner can call `resolveGroupSchedule(members)` from `@/features/agent` with members fetched via `getSharablePreferencesBatch(ids, 'group_plan')`.
- ~~01: call `loadAgentPreferences(ctx)` from `supabase/seed/agent.ts` in `runSeedWith` right after `loadUsers(ctx)`.~~ Done: ws02 registered it in 01's `supabase/seed/loaders/registry.ts` `AFTER_USERS` (c23982b).
- ~~01: add `'agent.follow_up_suggestion'` to `PROMPT_IDS` and spread ws02's prompt definitions into `PROMPTS`.~~ Done on main; ws02 filled the `agent.ts` slot (aba1bb7).
- ~~01: until the app shell lands, ws02 ships tokens, a bare layout and local primitives; replace them with 01's versions on merge.~~ Tokens and layout now come from main; `primitives.tsx` now wraps 01's Button/AiTag/AiRing; Chip/ToggleChip/Switch stay local (see the ui/Chip ask above).
- ~~README/01: make `SharablePreferences.groupSizePref` nullable.~~ Done on main; ws02 now shares `null` instead of `'small'` (db7b82e).
- ~~01: `profiles`, `agent_action_log`, `set_updated_at()`, `src/lib/api`, `src/lib/ai`, `logAgentAction`, `getCurrentUser`.~~ Landed on main; ws02 stubs removed (aba1bb7).

## Blocked
- 2026-10-24 19:40 — main moved (808078c: 01 adopted the server-only alias for every project, MOCK_AI on integration, per-chip remove names and Switch external labels). Merging it conflicts in `vitest.config.ts` only, on one comment line where main supersedes ws02. Held per integration instructions: merge aborted, branch left at 0cb50b8. Resolution when cleared: take main's `vitest.config.ts`, then drop the in-file `MOCK_AI` pins in `tests/integration/agent/*.test.ts` and switch `primitives.tsx` Chip/Switch to `@/features/core/components/ui`.
- (partly unblocked) Migration + RLS are now verified without Docker via PGlite in `tests/integration/agent/migration.test.ts`; it also passed against ws/01-core's real `0100_core.sql`. The supabase-js integration tests still need the local stack.
- Running the live prompt eval (`pnpm tsx tests/evals/agent/run.ts`) needs `ANTHROPIC_API_KEY`; the set itself is committed and checked in CI.
- ~~Even with Docker, `0200_agent.sql` needs 01's `0100_core.sql`, which is not on main yet.~~ Unblocked: 01 is on main; 0100 + 0200 apply on a fresh reset.
- ~~Full clean-state check waits on 01 landing on main.~~ Done 2026-10-24 (see Log).

## Log
- 2026-10-24 15:31 · landed: progress checklist, tooling, 0200 migration, schemas, time-slot mapper, consent boundary core (37 unit tests). Next: explainRecommendation, rate limiter, onboarding loop, MOCK_AI fixtures.
- 2026-10-24 15:45 · landed: explanations with grounding, rate limiter, extraction merge + anti-invention guard, MOCK_AI fixtures + prompts, repo, onboarding/preferences/chat services, index exports, follow-up suggestion (85 unit tests). Next: API routes, then UI.
- 2026-10-24 16:05 · landed: 6 API routes (+ route tests), preferences seed + loader, tokens/layout, onboarding/agent/preferences/permissions/log screens; `pnpm build` green, 99 unit tests. Next: component tests, eval transcripts, Playwright Scene 1 spec (runs once Docker exists).
- 2026-10-24 16:15 · landed: slot mapper per-clause fix, 10-transcript eval set + live runner, repo + follow-up tests; 114 unit tests, 95% line coverage on features/agent/server. Next: DB integration tests (auto-skip without Supabase), Playwright Scene 1 spec, UI component tests.
- 2026-10-24 16:25 · landed: Supabase integration tests (auto-skip), Playwright Scene 1 (passing). Next: P1 feedback memory and group scheduling helper, UI component tests.
- 2026-10-24 16:40 · landed: P1 group scheduling helper, P1 feedback memory (route, storage, prompt injection, thumbs UI); 123 unit tests + Scene 1 E2E green. Next: AC3 shared consent fixture for 03/04, UI polish, dark-mode screenshots.
- 2026-10-24 16:55 · landed: shared AC3 consent fixture + boundary test, theme check (5 screens × light/dark × 320/768/1024/1440, no overflow); 126 unit + 9 E2E green. Next: wait for 01 scaffold on main and swap stubs; meanwhile UI component edge cases.
- 2026-10-24 17:10 · landed: privacy guard test (no agent-table reads outside features/agent), AI_UNAVAILABLE → form fallback with E2E; 128 unit + 10 E2E green. Next: keep syncing for 01; component edge cases.
- 2026-10-24 17:30 · ws/01-core reviewed (read-only): re-keyed preferences seed to 01's 14 users (clusters preserved), loader takes SeedContext, fixtures readable by 01's mock loader, prompt defs in 01's registry shape; merge plan recorded. 131 unit + 10 E2E green. Next: wait for 01 on main.
- 2026-10-24 17:50 · landed: PGlite migration/RLS suite (8 tests; also green on ws/01-core's real 0100). 131 unit + 8 PGlite + 10 E2E green. Next: wait for 01 on main, then run the merge plan.
- 2026-10-24 18:05 · landed: getAttendeeSharing + getConsent for 06 (consent-gated, logged), spec §5 documents ExplainInput and all extra exports. 145 unit/integration + 10 E2E green. Next: wait for main.
- 2026-10-24 16:35 · integration check (Docker, throwaway merge with ws/01-core, nothing pushed to main): findings 1-4 recorded above. Next: 01 integrator handles 1, 2, 4; ws02 fixes 3 during the main sync.
- 2026-10-24 16:32 · ws02 worker moved to the Docker machine (option 2). Ticked integration rows + AC2/AC5 from the verified DB run. Next: wait for 01 on main, then run the sync procedure.
- 2026-10-24 17:40 · Lenovo resumed as the ws02 worker. Full check on Node 22: typecheck + lint clean, 145 unit/integration green (5 Supabase-stack tests skip until 01's 0100 is on main), 10/10 Playwright green. Nothing unblocked left: AC3 waits on 03/04; DB variant and stub swap wait on 01 landing on main.
- 2026-10-24 18:40 · 01 landed on main: merged main (15 conflicts resolved per plan), adopted nullable groupSizePref + interestCategories, fixed strict-indexing errors, removed 01 stubs for real exports, registered preferences seed, full-stack agent E2E, fixed 320px overflow inside the shell. Clean state on Node 22: db reset + seed (14 prefs), 217 unit + 30 integration + 26 E2E green, typecheck + lint clean. Next: primitives swap (merge plan 7), AC3 waits on 03/04.
- 2026-10-24 18:55 · landed: merge plan step 7 (01's Button/AiTag/AiRing). 217 unit + 10 agent E2E green; typecheck + lint clean. Next: AC3 waits on 03/04; Never-idle list.
- 2026-10-24 19:30 · CI fix: regenerated database.types.ts for 0200 (types job was red on 583ce64; green on 9c680ca). Landed real consented people suggestions for agent chat (unit + integration) and AC4 E2E. Clean state: db reset + seed, types current, 222 unit + 32 integration + 26/27 E2E (1 flaky 01 auth timing test, passes on rerun), typecheck + lint clean. Remaining: AC3 (03/04), events/groups stubs (06/03), ui/Chip ask (01).
