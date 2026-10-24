# Workstream 04 — Progress

Branch: `ws/04-demand` · Spec: [specs.md](./specs.md)

## Checklist

### Contracts and data
- [x] `0400_demand.sql`: `opportunity_runs`, `demand_clusters`, `demand_cluster_members`, `event_proposals`, RLS
- [x] `ProposalDocument` Zod schema + `StoredProposal` (adds `suggestedStartsAt`, as 05 asked)
- [x] `runOpportunityPipeline(opts)` exported from `src/features/demand/index.ts`
- [x] `MOCK_AI` fixture `demand.generate_proposal.json` (Beginner Pottery & Coffee Night, thu_eve 18:00, 120 min, cap 10, 2000 cents, band 6-9)
- [x] `tests/fixtures/demand/users-scene3.json` (14 seeded users as SharablePreferences, from 02's preferences seed)

### Pipeline (spec §5)
- [x] Collect + batched `collect_signals` log (02 consent rule applied in a stub until 02 lands)
- [x] Filter
- [x] Cluster: geocells + 8-neighborhood radius merge
- [x] Threshold, aggregate, rank, cap
- [x] DemandBrief (no ids, names, coordinates)
- [x] Match business through 05 `findCandidateBusinesses`, per-business cap
- [x] Generate (`demand.generate_proposal`, smart) with one regeneration on validator failure
- [x] Validate in code (capacity, slot, hosted slot, price, forbidden phrases, band overwrite, `suggestedStartsAt` ≥ 5 days out)
- [x] Store (atomic `save_demand_proposal` RPC) + notify owner
- [x] LLM failure isolated per cluster
- [x] Run lock: one-running-run unique index + stale reclaim (see Decisions)

### API and UI
- [x] `POST /api/ai/generate-opportunities` (202 + `{ runId }`, run finishes in `after()`; DEMO_MODE or `is_operator`)
- [x] `GET /api/ai/opportunities/:runId`
- [x] `GET /api/cron/opportunities` (Bearer `OPPORTUNITY_CRON_SECRET`; closed when unset)
- [x] `/admin/opportunities` operator page (DEMO_MODE only; `pnpm build` green)

### Tests (spec §9)
- [x] Unit: geocell + neighbor merge
- [x] Unit: a user lands in ≤ 1 cluster per (category, slot)
- [x] Unit: threshold suppresses a 3-person cohort
- [x] Unit: banding
- [x] Unit: interest tag count floor
- [x] Unit: business selection rejects capacity < cohort (05 prefilter + 04 re-check)
- [x] Unit: validator rejects over-capacity, out-of-range price, forbidden phrases; band is overwritten
- [x] Unit: `suggestedStartsAt` ≥ 5 days out on the right weekday (DST-safe)
- [x] Unit: dedup window
- [x] Integration (MOCK_AI, seeded): Scene 3 run creates one creative/thu_eve proposal for Kiln & Cup and one games/fri_eve for Meeple House
- [x] Integration: opted-out user absent from `demand_cluster_members`
- [x] Integration: second run within 14 days creates 0 proposals
- [x] Integration: business owner can read the proposal but gets 0 rows from `demand_cluster_members`
- [x] Integration: run stats populated; notification delivered to owner
- [ ] Prompt eval (manual, live key): 5 briefs, ≥ 4/5 pass validator first try — set + runner committed (`tests/evals/demand/`); live run blocked on a key
- [x] E2E Scene 3: Generate → tracker completes → table shows the pottery proposal (`tests/e2e/demand-scene3.spec.ts`)

### Acceptance criteria (spec §10)
- [x] AC1 One click → "Beginner Pottery & Coffee Night" to Kiln & Cup, band 6-9, ≥ 1 assumption (unit + integration + Playwright)
- [x] AC2 Nothing a business sees has a user id, name, raw count or exact coordinate (proposal JSON has no ids; owners get column-limited `demand_clusters`, no members/runs; integration-tested)
- [x] AC3 Cohort below MIN_COHORT_SIZE never materialized (unit: 3-person cohort suppressed, never stored)
- [x] AC4 Safe to trigger twice (dedup) and concurrently (advisory lock) (integration: second run 0 proposals; concurrent run refused)
- [x] AC5 LLM failure on one cluster does not block others; reported in stats

### P1
- [x] `POST /api/ai/proposals/:id/revise`: body `{ note?, priceCents?, capacity?, slot? }` (≥ 1), owner-only via RLS, returns `{ proposalId, revision, revisionCount }`; versions in `business_edits.revisions[]`
- [ ] Group-originated proposals (`source: 'group'`)
- [ ] Demand confidence band ("6 people, likely 4-8 attendees")

## Decisions
- 2026-10-24: 01 has not merged to main. Copied 01's tooling, `src/lib/**`, `src/shared/**`, `supabase/config.toml`, `0100_core.sql` and integration helpers byte-for-byte from `origin/ws/01-core` @ 00799fd so this branch builds and tests. No history merged from another ws branch; main wins on conflict.
- `SharablePreferences` has no `interestCategories`. 04 uses the field when present and otherwise derives categories from interest tags (`server/categories.ts`). See Needs from others.
- Dedup is per signature: a cluster is skipped if any pending proposal for its signature exists within 14 days, whatever the business. Stricter than "best business without one", and it is what makes a second run create 0 proposals.
- Ranking follows spec §5.4 literally (`memberCount × share holding the top tag`). On Scene 3 data the 5-person board-game cohort (all share `board-games`) ranks above the 6-person creative cohort, whose interests are spread across pottery/ceramics/painting. Both are kept.
- `clustersSuppressed` counts clusters below the cohort minimum plus any over `maxClustersPerRun`.
- Band mismatch is fixed by overwriting the model's `demand` block from the cluster (spec §5.8 "overwrite, never trust"), not by rejecting.
- `suggestedStartsAt` is computed in America/Los_Angeles and stored inside the `proposal` JSON (05's ask).
- Under MOCK_AI the generate step uses the Scene 3 fixture only when its category and slot match the brief; other briefs get a deterministic template from the brief and venue (01's mock loader returns one fixture per prompt).
- Using Node 22 locally: 01's resolved `@supabase/supabase-js` needs native WebSocket (see 02 PROGRESS integration findings).
- Run lock: spec §5 asks for a Postgres advisory lock, but session advisory locks do not survive PostgREST connection pooling. `opportunity_runs` has a unique index allowing one `running` row; `start_opportunity_run()` inserts it or returns null, and reclaims runs stuck `running` for 10+ minutes.
- Business-read policies call `demand_owns_business()` (plpgsql, resolved at call time) because 0400 runs before 05's 0500 creates `businesses`. 0500 adds the `business_id` FK, as 05 recorded.
- AC2 over spec §4: the `clusters_business_read` policy would expose `member_count`, `geocell`, centre and tag counts. Owners get column-level SELECT on non-identifying columns only.
- Store is one `save_demand_proposal()` RPC (cluster + members + proposal in one transaction); `event_proposals.proposal` is frozen by a trigger.
- Integration tests create guarded stand-ins for 02's and 05's tables from `tests/integration/demand/test-schema.sql` via `psql` in the local db container; nothing test-only is in `supabase/migrations`.

- `0402_operator.sql` adds `profiles.is_operator` (spec §6 names 0402); a trigger stops anyone but the service role changing it.
- Copied 01's UI primitives, styles, ThemeScript, root layout, health route and Playwright config byte-for-byte (same rule as the tooling copy).

## Needs from others
- 02 / README: add `interestCategories: EventCategory[]` to `SharablePreferences` (02 already stores it). Until then 04 derives categories from tags.
- 02: export `getSharablePreferencesBatch(ids, 'demand')` from `@/features/agent` on main (exists on ws/02-agent).
- 05: `findCandidateBusinesses` returns `BusinessMatch` only; 04 also needs capacity, hosting slots, price range, equipment tags and owner id to draft and validate. 04 reads them from `businesses` + `business_capabilities` with the service role until 05 exports a `getVenueForProposal(businessId)` (or similar).
- 01: `vitest.config.ts` coverage `include` lists only `features/core/server` and `lib`; add `src/features/*/server/**` so each workstream's 80% bar is measured. ws04 measures it with `--coverage.include` (92% lines, unit + integration).
- README §4 + 05: add `POST /ai/proposals/:id/revise` to the 04 routes row. Shape for 05's "Ask AI to revise": body `{ note?: string, priceCents?: int, capacity?: int, slot?: AvailabilitySlot }` (at least one), response `{ proposalId, revision: StoredProposal, revisionCount }`; latest version is `business_edits.revisions.at(-1).proposal`. 409 once the proposal is decided.
- 01: keep `...DEMAND_PROMPTS` in `PROMPTS` when merging (prompt lives in `src/lib/ai/prompts/demand.ts`).

## Blocked
- Prompt eval (spec §9) needs a live `ANTHROPIC_API_KEY`; never run here (no secrets on this machine).

## Log
- 2026-10-24 17:05 · landed: 01 tooling copy, proposal schema/prompt/fixtures, full pure pipeline (42 unit tests). Next: 0400 migration, Supabase wiring, API routes, operator page, integration tests.
- 2026-10-24 17:35 · landed: 0400 migration (RLS, run lock, atomic store), Supabase wiring behind 01/02/05 stubs, 8 integration tests on local Supabase; 42 unit + 8 integration green. Next: API routes, cron route, operator page.
- 2026-10-24 18:05 · landed: operator flag (0402), generate/status/cron routes, /admin/opportunities page; 56 unit + 10 integration green, build green. Next: Playwright Scene 3, then P1 revise endpoint for 05.
- 2026-10-24 18:20 · landed: Playwright Scene 3 (green). Clean-state check on Node 22: db reset, 56 unit + 10 integration + 1 E2E green, typecheck + lint clean, 92% line coverage on features/demand/server. Next: prompt eval set, P1 revise endpoint for 05.
- 2026-10-24 18:45 · landed: prompt eval set + live runner, P1 revise endpoint (unit + integration). 68 unit + 11 integration + 1 E2E green, build green. Next: P1 demand confidence band; wait for 01/02/05 on main to swap stubs.
