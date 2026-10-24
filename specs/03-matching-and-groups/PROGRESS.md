# Workstream 03 — Progress

Branch: `ws/03-matching`. Spec: [`specs.md`](./specs.md). Shared contracts: [`../README.md`](../README.md).

## Foundations (unblock others first)

- [x] Migration `0300_social.sql` (tables, RLS) + `0301_social_functions.sql` (guard triggers, service-role functions)
- [x] Contracts: `getCompatibilityScore()` from `src/features/matching/index.ts`, `getGroupMemberIds()` from `src/features/groups/index.ts`
- [x] Helpers 06 asked for: `getConnectionIds`, `getBlockEdges`, event-invitation create/read, top matches for Discover (`getSuggestedPeople`), public groups (`getPublicGroups`)
- [x] Zod schemas for request bodies, rows and DTOs
- [x] Stubs for 02 (`getSharablePreferences`, `explainRecommendation`) and 06 (`getUpcomingEventsForUser`) in `server/stubs.ts`
- [x] MOCK_AI fixture `groups.plan_activities.json`

## Acceptance criteria (P0, spec §10)

- [x] AC1. Seeded demo user receives ranked matches whose top 3 share `creative` interests and `thu_eve` (verified with the interim 02 §8 preferences fixture until 02's seed lands)
- [x] AC2. Every match card shows an explanation grounded in shared fields
- [x] AC3. Connection, block, report, group create/invite/accept/remove/leave all work and respect authorization
- [x] AC4. Group planner produces 2–4 suggestions referencing only shared slots and consenting members' data
- [x] AC5. A group can view upcoming events (through 06's contract) and open them (contract-level test against 06's stand-in; real events need 05/06 on main)

## Build items (P0, spec §3, §6, §7)

- [x] Compatibility engine: hard filters, weighted score (35/25/20/10/10), explanation
- [x] `GET /api/matches`: candidate set (≤ 500), 5-minute per-viewer cache, top 20
- [x] `POST /api/connections`, `PATCH /api/connections/:id`, `GET /api/connections`
- [x] `POST /api/users/:id/block`, `POST /api/users/:id/report`
- [x] `POST /api/groups`, `GET /api/groups`, `GET /api/groups/:id`, `PATCH /api/groups/:id`
- [x] `POST /api/groups/:id/invite`, `PATCH /api/invitations/:id`
- [x] `DELETE /api/groups/:id/members/:userId`, `POST /api/groups/:id/leave` (with owner transfer)
- [x] `POST /api/groups/:id/plan` (group planner)
- [x] UI `/match` (Screen 3)
- [x] UI `/groups` (Screen 4)
- [x] UI `/groups/:id` (Screen 5)
- [x] Seed: group members, `connections.json` (6 accepted edges), one block pair

## Tests (spec §9)

### Unit
- [x] Score components with golden values: identical users = 100, disjoint = 0, adjacent group size = 0.5
- [x] Hard filters
- [x] Haversine
- [x] Planner pre-work: slot intersection, budget envelope
- [x] Suggestion validation drops bad event ids and slots

### Integration
- [x] Matches exclude non-discoverable, non-consenting, blocked, already-connected
- [x] Connection uniqueness constraint
- [x] Recipient-only accept
- [x] Block declines pending and hides both ways
- [x] Private group invisible to non-members
- [x] Owner cannot be removed
- [x] Leave with transfer
- [x] Planner refuses with < 2 consenting members
- [x] Planner never includes names in prompt input (assert on captured mock input)

### E2E
- [x] Scene 2: demo user sees ≥ 3 matches with explanations → connects with one → creates "Thursday Makers" (private) → invites 2 → second seeded user accepts via API → roster shows 2 active

## P1

- [x] Voting on planner suggestions (`POST /api/groups/:id/plans/:planId/vote`)
- [ ] Send a chosen `new_activity` suggestion to 04 as a group-originated proposal request — eligibility (≥ 50% votes) and the "Request venue" button are done; `getGroupVenueRequest()` is exported for 04; needs 04's `source: 'group'` path
- [x] Filters on `/match` by interest and social goal
- [x] Basic 1:1 messaging between accepted connections (text only, polled)
- [x] Public group discovery (`/groups/discover`)

## Decisions

- 2026-10-24: 01 has not landed on main. This branch carries a byte-identical copy of ws/01-core@43d5910 (everything except CI) and of ws/02-agent's `0200_agent.sql`, so migrations, integration tests and the Scene 2 E2E run on the real local Supabase stack. No copied file is edited except where 01 asked owners to (seed group loader); main wins on all of them and identical copies merge cleanly.
- 2026-10-24: RLS policies call security-definer helpers (`is_group_member`, `is_group_admin`, `can_read_group`, `is_blocked_with`). The spec's literal policies recurse (`group_members` policies select `group_members`), and its `plans_read` subquery compared `m.group_id = group_id` inside `group_members`, which matched every group. `is_blocked_with(other)` only answers for the caller's own pairs so blocks cannot be probed.
- 2026-10-24: Multi-row writes go through service-role-only functions called after TypeScript authorization checks: `create_group_with_owner`, `invite_to_group`, `remove_group_member`, `leave_group`, `transfer_group_owner`, `block_user`. Guard triggers keep invariants for direct PostgREST writes too: connection parties/message are immutable and status moves only pending → accepted/declined or accepted → declined; admins may edit only a group's descriptive columns; answering a group invitation activates (accept), leaves (decline) or removes (expire) the membership in the same statement.
- 2026-10-24: `groups.creator_id` and `invitations.sender_id` cascade on profile delete and `group_plans.requested_by` is set null (the spec left them restrict, which breaks 01's idempotent seed that deletes users).
- 2026-10-24: Schema additions beyond the spec: `updated_at` + trigger on connections, group_members and invitations (README: every table), `created_at` on group_members, `groups.archived_at` (the spec archives a group when its last member leaves), invitation target check (group needs `group_id`, event needs `event_id`), one pending group invitation per (group, recipient), one active owner per group.
- 2026-10-24: Block also ends an accepted connection (status `declined`), expires pending event invitations between the pair and pending invitations into private groups where the other person is active.
- 2026-10-24: Scorer interpretation: breakdown values are each component's similarity in [0, 1]; the location radius is the smaller of the two travel radii; budget overlap is divided by the narrower range (unknown budget = 1, missing minimum = 0); every Jaccard over two empty sets is 0; unknown location fails the distance hard filter; `sharedInterests` lists shared tags, then shared categories.
- 2026-10-24: `SharablePreferences` has no `interestCategories`; the scorer accepts them when present and otherwise derives categories from interest tags (`server/categories.ts`).
- 2026-10-24: Seed: group loading moved to `supabase/seed/loaders/social.ts` (writes `creator_id`); Thursday Night Crew gets a real pending invitation for maya (01's seeded notification refers to it); kai blocks leo.
- 2026-10-24: Supabase CLI image pulls hang in Docker Desktop's credential helper on this machine; the stack is started with a scratch `DOCKER_CONFIG` that has no credential store (public images need none).

- 2026-10-24: Matches exclude anyone with an existing connection row, declined included: a pair can only ever have one edge, so a declined person could not be re-requested and should not resurface.
- 2026-10-24: `GET /api/matches` returns `MatchCard[]` as specced; the page calls the service directly to get the empty-state reason (`not_discoverable`, `no_location`, `no_candidates`). Each cache fill logs one `score_matches` agent action for the viewer.
- 2026-10-24: Match explanations come from 02's `explainRecommendation` (cached 24h by viewer, candidate, prefs hash) behind a grounding check: the text must cite a shared interest, a shared slot's day or a shared goal, otherwise a deterministic sentence built from shared fields is used. AC2 holds even when a MOCK_AI fixture returns the same text for every card.
- 2026-10-24: Connection requests and group invites reach only people who are discoverable, already connected, or share an active group; blocked or unreachable recipients get NOT_FOUND so a block is never disclosed. A duplicate request is CONFLICT with `{ connectionId, direction }` details.
- 2026-10-24: Reports are inserted with a server-generated id because reporters have no read policy on `reports`.
- 2026-10-24: Group invites skip blocked pairs (with the inviter), current members and unreachable people, and report the skipped counts. Re-inviting someone who left or was removed reopens their membership.
- 2026-10-24: Admin group edits go through the service role after the TypeScript check so `kind` follows `visibility`; RLS still limits direct edits to admins. Only the owner can remove an admin; admins come from ownership transfer (the spec has no promote route).
- 2026-10-24: The group Events tab lists events shared with the group (event invitations) and events active members have a confirmed RSVP for, through 06's contracts only; it shows a count of members going, never names, and the viewer's own RSVP status.
- 2026-10-24: Planner prompt id is `groups.plan_activities` (spec); it replaces 01's reserved `groups.plan_activity` in `src/lib/ai/prompts/index.ts`, where its system prompt is registered.
- 2026-10-24: Planner requires at least one slot all consenting members share (VALIDATION otherwise). Candidate events: published, in a shared slot, in a member category, within the budget envelope. If the model fails, suggestions come from the aggregates; every plan has 2–4 suggestions and leads with a candidate event when one exists. Members' full and first names are scrubbed from the request before it reaches the model. Each consenting member gets one `group_plan` agent log row.
- 2026-10-24: Votes toggle per member and suggestion; a `new_activity` that needs a venue becomes eligible to send to 04 at ≥ 50% of active members.

- 2026-10-24: UI uses 01's primitives and tokens from `@/features/core/components/ui`. `/match` leads with the top match (breakdown open) and lists the rest as compact rows; `/groups` leads with invitations when there are any; on a group page the planner is the lead element. Chips show shared tags when there are any (their categories are implied), otherwise shared categories.
- 2026-10-24: Client components call routes through `src/lib/api/fetch-json.ts` and `use-api-action.ts` (new, client-safe; the `@/lib/api` index pulls in server-only modules). A missing route (e.g. 04's group venue request before 04 ships) shows "This isn't available yet" instead of a network error.
- 2026-10-24: The invite picker lists accepted connections, people with an open request, then matches; the server re-checks reachability and blocks.
- 2026-10-24: `tests/fixtures/social/preferences.json` is an interim copy of 02 §8's seed design used by the AC1 integration test and the Scene 2 E2E (applied with the service role after the seed). It is never loaded by `pnpm db:seed`, so it cannot collide with 02's `preferences.json`.

- 2026-10-24: P1 messaging adds `0302_direct_messages.sql` (`direct_messages`, RLS: both parties of an accepted connection read and write, so a block hides the thread), `GET/POST /api/connections/:id/messages` (`after` for polling) and a Connections tab on `/match` whose chat polls every 5 s. No notification type exists for messages, so none is sent.

- 2026-10-24: The candidate prefilter runs on radius in SQL and caps at 500 but does not prefilter by shared category in SQL (spec §12 risk mitigation): that would mean reading `user_preferences` outside 02's consent boundary. Categories are compared after the consent-gated batch read.
- 2026-10-24: `/match`, `/groups` and `/groups/:id` have route `loading.tsx` skeletons (explanations can take a moment with the live model) and `error.tsx` boundaries with a retry. Tab strips scroll sideways at narrow widths.

- 2026-10-24: `getGroupVenueRequest(groupId, planId, suggestionIndex)` (from `@/features/groups`) returns the shape 04 asked for: `{ groupId, planId, title, category, slot, neighborhoodLabel, centerLat, centerLng, memberCount, groupSizeMode, budgetMaxCents, activityPrefs }` plus `suggestionIndex`, `description`, `estimatedCostCents`, `votes`. Location fields are null when no consenting member shared a location; activity tags need at least two members (04's tag floor). Null unless the suggestion is a `new_activity` that needs a venue and has ≥ 50% of active members' votes.
- 2026-10-24: Plan for when ws/01-core reaches main (read on its branch, not merged): take main's version of every copied 01 file this branch never edited; move the `groups.plan_activities` system prompt into `src/lib/ai/prompts/groups.ts` (`GROUPS_PROMPTS`); register `loadConnections` and `loadBlocks` in `supabase/seed/loaders/registry.ts` `AFTER_ALL` and drop this branch's runner/domain edits (01's `loadGroups` now writes `creator_id`); switch client calls to 01's `src/lib/api/client.ts` if it covers `fetchJson`; add `interestCategories` (now required) to test fixtures; regenerate `database.types.ts`.

## Needs from others

- Integrator: merge ws/01-core to main first. This branch carries byte-identical copies of 01's files and of 02's `0200_agent.sql`; after 01 lands, regenerate `src/lib/supabase/database.types.ts` on main (`pnpm db:types`) since every workstream regenerates it.
- 01/02 (README §4 `SharablePreferences`): add `interestCategories: EventCategory[]`. 02 already stores `interest_categories`, and 03 §5 and 06 §5 both score on it. Until then 03 derives categories from tags.
- 02: `supabase/seed/fixtures/preferences.json` (02 §8). Scene 2 and AC1 need seeded preferences and consent; 03's tests apply an interim copy of the 02 §8 design.

- 01: `src/lib/ai/prompts/index.ts` now lists `groups.plan_activities` (spec name) instead of the reserved `groups.plan_activity`, with its system prompt. `matching.explain_match` is unused: 03 explains matches through 02's `explainRecommendation`.
- 06: swap your 03 stubs for the real exports, same signatures: `getConnectionIds`, `getBlockEdges`, `getSuggestedPeople` from `@/features/matching`; `getGroupMemberIds`, `createEventInvitations`, `getPendingEventInviteeIds`, `getPendingEventInvitations`, `getPublicGroups` from `@/features/groups`.
- 06: `EventSummary` has no `category`, so the planner calls `getEventPublic` per candidate; adding `category` to `EventSummary` would remove those lookups. `getUpcomingEventsForUser` also does not say whether an RSVP is shared with attendees, so group pages show only a count of members going.

- 04 (P1 group proposals, answered): `getGroupVenueRequest` is exported from `@/features/groups` with the shape you asked for (see Decisions). The group page's "Request venue" posts `{ source: 'group', groupId, planId, suggestionIndex }` to `POST /api/ai/generate-opportunities` once a `new_activity` that needs a venue has ≥ 50% of active members' votes.

- 01: at 320px the consumer `TopBar` is 27px wider than the viewport on every page (theme toggle, bell, avatar and sign-out next to the wordmark and search), so pages scroll sideways (design-system §3: no horizontal scroll at 320px). 03's own content fits; this one is in `src/features/core/components/app-shell/TopBar.tsx`.

## Blocked

## Log

- 2026-10-24 17:20 CDT · read 01/04/06 branches: 06 aligned its stubs to 03's exports; 04 asked for `getGroupVenueRequest` (now matches their shape); 01 split prompts and seed loaders into per-workstream registries (merge plan recorded). main still has only specs. Next: watch main, adopt 01's layout when it lands.
- 2026-10-24 17:17 CDT · clean-state check green (db reset → seed → 138 unit, 96 integration, 16 E2E, typecheck, lint). Landed loading/error states, 320px tab overflow fix, icon and menu-focus polish, group edge-case tests. Next: keep syncing main for 01/02/06 landings; swap stubs when they arrive.
- 2026-10-24 17:12 CDT · landed: `getGroupVenueRequest` export for 04, contract tests for every 03 export, P1 direct messages (migration, routes, Connections tab, polled chat) with integration and E2E tests. Coverage on 03 server code: 92% statements, 83% branches. Next: clean-state check, design checklist pass, edge cases.
- 2026-10-24 17:05 CDT · landed: `/match` (lead card, compact rows, filters, connect/block/report sheets, requests tab), `/groups`, `/groups/:id` (planner lead, votes, venue request, events, members/invite/transfer/leave), `/groups/discover`; AC1 integration test; Scene 2 Playwright test. All P0 items ticked. Totals: 138 unit, 78 integration, 15 E2E green (earlier log line's "112" should have read 120). Next: P1 messaging, 04 venue-request export, coverage, clean-state check.
- 2026-10-24 16:45 CDT · landed: matches service + `GET /api/matches` with grounded explanations; connection, block and report routes; group services, invitations, removal, transfer, leave/archive; group planner (consent-gated aggregates, name scrubbing, validation, fallbacks) and votes; matching/groups contracts for 06. 112 unit+integration tests across 03 (63 unit, 57 integration incl. seed). Next: `/match`, `/groups`, `/groups/:id` UI, then the Scene 2 E2E.

- 2026-10-24 16:25 CDT · landed: progress file; 01 scaffold + 02 migration copies; 0300/0301 migrations (RLS, guards, service functions) with 18 integration tests; seed contribution (groups, 6 connections, a block) with 3 tests; compatibility scorer with 34 unit tests. Next: matches service + `GET /api/matches`, then connections, block and report routes.
