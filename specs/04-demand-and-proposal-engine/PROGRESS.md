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
- [x] `POST /api/ai/proposals/:id/revise` (05 asked for `{ note }`): 0403 migration, `demand.revise_proposal` prompt + fixture, 12 unit tests; RPC verified in PGlite; supabase-js integration test written (`tests/integration/demand/revise.test.ts`), not yet run (no Docker here)
- [ ] Group-originated proposals (`source: 'group'`) — waiting on 03 to confirm the export shape below
- [x] Demand estimate: `proposal.attendanceEstimate { min, max, confidence }` from the band only (no raw count, AC2)

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
- Revise (P1) stores a new pending proposal that supersedes the old one (05 offered this option) instead of spec §6's `business_edits.revisions[]`: `proposal` is frozen by a trigger and 05's `decide_proposal` overwrites `business_edits` with its `EventEdits`. 0403 adds `supersedes_id`, `revision` (max 3, check constraint) and `revision_request`; `save_proposal_revision()` locks the parent, so a revise cannot race an approve. Spec §6 updated.
- Revise: owner `priceCents` / `slot` win even outside the venue's listed range or hosting slots (the owner is the business); `capacity` must stay ≤ venue capacity (400). Owner numbers overwrite the model's output. The note is treated as a request, not instructions; the forbidden-phrase check still runs, with one regeneration.
- Revise: ownership is the existing `proposals_business_read` RLS policy (the row is read with the caller's own client), so "not yours" is a 404. The shared AI rate limiter applies.
- 2026-10-24 (merge): the previous ws04 machine pushed its own revise endpoint (`business_edits.revisions[]`, `revise-wiring.ts`) at the same time. On merge the supersede design (0403) was kept for the reasons above and that version, its prompt clause and its integration case were removed; its eval set and attendance estimate were kept unchanged. Revisions recompute `attendanceEstimate` from the band and new capacity.
- 2026-10-24: this clone (Tanish Patro) moved from ws02 to ws04 (`commonground.workstream=4`; name and email unchanged). It has no Docker, so integration and E2E rows cannot be rerun here; migrations are checked with PGlite from the scratchpad, as 02 did.
- Copied 01's UI primitives, styles, ThemeScript, root layout, health route and Playwright config byte-for-byte (same rule as the tooling copy).

## Needs from others
- 02 / README: add `interestCategories: EventCategory[]` to `SharablePreferences` (02 already stores it). Until then 04 derives categories from tags.
- 02: export `getSharablePreferencesBatch(ids, 'demand')` from `@/features/agent` on main (exists on ws/02-agent).
- 05: `findCandidateBusinesses` returns `BusinessMatch` only; 04 also needs capacity, hosting slots, price range, equipment tags and owner id to draft and validate. 04 reads them from `businesses` + `business_capabilities` with the service role until 05 exports a `getVenueForProposal(businessId)` (or similar).
- 01: `vitest.config.ts` coverage `include` lists only `features/core/server` and `lib`; add `src/features/*/server/**` so each workstream's 80% bar is measured. ws04 measures it with `--coverage.include` (92% lines, unit + integration).
- 03 (P1 group proposals, answering 03's ask): please export `getGroupVenueRequest(groupId, planId, suggestionIndex): Promise<GroupVenueRequest | null>` from `@/features/groups`, returning null unless the suggestion has ≥ 50% of active members' votes. Shape: `{ groupId, planId, title, category: EventCategory, slot: AvailabilitySlot, neighborhoodLabel, centerLat, centerLng, memberCount, groupSizeMode: GroupSizePref | null, budgetMaxCents: number | null, activityPrefs: string[] }` with coarse (2 dp) coordinates and no member ids. 04 then accepts `{ source: 'group', groupId, planId, suggestionIndex }` on `POST /api/ai/generate-opportunities`, stores `source = 'group'`, `source_group_id`, no `demand_cluster_members`, and dedups per (group, plan, suggestion).
- 05: revise is live on this branch. `POST /api/ai/proposals/:id/revise` with `{ note?, priceCents?, capacity?, slot? }` → `201 { data: { proposalId, supersedes, revision, proposal } }`; errors 404 (not yours), 409 (not pending / 3 revisions), 400 (capacity over venue), 503 (AI). The old row turns `expired`; the inbox should list `pending` rows only and can show "Revised" when `revision > 0`. README §4 needs the route added.
- 01: `PROMPT_IDS` gains `'demand.revise_proposal'` (one line after `'demand.generate_proposal'`); keep it when merging.
- 01: keep `...DEMAND_PROMPTS` in `PROMPTS` when merging (prompt lives in `src/lib/ai/prompts/demand.ts`).

## Blocked
- P1 group-originated proposals wait on 03 agreeing the `getGroupVenueRequest` export (see Needs from others).
- No Docker on this machine: `pnpm test:integration` and the Scene 3 Playwright run cannot run here. They passed on the previous ws04 machine at 5f841ee; the new `tests/integration/demand/revise.test.ts` needs a run on a Docker host (or Docker Desktop installed here).
- Prompt eval (spec §9) needs a live `ANTHROPIC_API_KEY`; never run here (no secrets on this machine).

## Log
- 2026-10-24 17:05 · landed: 01 tooling copy, proposal schema/prompt/fixtures, full pure pipeline (42 unit tests). Next: 0400 migration, Supabase wiring, API routes, operator page, integration tests.
- 2026-10-24 17:35 · landed: 0400 migration (RLS, run lock, atomic store), Supabase wiring behind 01/02/05 stubs, 8 integration tests on local Supabase; 42 unit + 8 integration green. Next: API routes, cron route, operator page.
- 2026-10-24 18:05 · landed: operator flag (0402), generate/status/cron routes, /admin/opportunities page; 56 unit + 10 integration green, build green. Next: Playwright Scene 3, then P1 revise endpoint for 05.
- 2026-10-24 18:20 · landed: Playwright Scene 3 (green). Clean-state check on Node 22: db reset, 56 unit + 10 integration + 1 E2E green, typecheck + lint clean, 92% line coverage on features/demand/server. Next: prompt eval set, P1 revise endpoint for 05.
- 2026-10-24 18:45 · landed: prompt eval set + live runner, P1 revise endpoint (unit + integration). 68 unit + 11 integration + 1 E2E green, build green. Next: P1 demand confidence band; wait for 01/02/05 on main to swap stubs.
- 2026-10-24 19:00 · landed: P1 attendance estimate. 70 unit + 11 integration + 1 E2E green on Node 22; typecheck, lint, build clean. Remaining: live prompt eval (needs key), P1 group proposals (needs 03), swap stubs when 01/02/05 reach main.
- 2026-10-24 17:25 · worker moved to this machine. Landed: P1 revise endpoint (0403 migration, prompt, route, 12 unit tests, PGlite check of the RPC). 68 unit green, typecheck + lint clean on Node 22. Next: group-originated proposals (P1) behind a 03 stub, then the confidence band.
- 2026-10-24 17:35 · merged the other ws04 machine's pushes (eval set, attendance estimate, its revise). Revise kept on the supersede design (0403); its `business_edits.revisions[]` version removed. 76 unit green, typecheck + lint clean. This machine is now the only ws04 worker. Next: group proposals behind a 03 stub.
