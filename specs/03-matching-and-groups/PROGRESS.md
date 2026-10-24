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

- [ ] AC1. Seeded demo user receives ranked matches whose top 3 share `creative` interests and `thu_eve`
- [ ] AC2. Every match card shows an explanation grounded in shared fields
- [x] AC3. Connection, block, report, group create/invite/accept/remove/leave all work and respect authorization
- [x] AC4. Group planner produces 2–4 suggestions referencing only shared slots and consenting members' data
- [ ] AC5. A group can view upcoming events (through 06's contract) and open them

## Build items (P0, spec §3, §6, §7)

- [x] Compatibility engine: hard filters, weighted score (35/25/20/10/10), explanation
- [x] `GET /api/matches`: candidate set (≤ 500), 5-minute per-viewer cache, top 20
- [x] `POST /api/connections`, `PATCH /api/connections/:id`, `GET /api/connections`
- [x] `POST /api/users/:id/block`, `POST /api/users/:id/report`
- [x] `POST /api/groups`, `GET /api/groups`, `GET /api/groups/:id`, `PATCH /api/groups/:id`
- [x] `POST /api/groups/:id/invite`, `PATCH /api/invitations/:id`
- [x] `DELETE /api/groups/:id/members/:userId`, `POST /api/groups/:id/leave` (with owner transfer)
- [x] `POST /api/groups/:id/plan` (group planner)
- [ ] UI `/match` (Screen 3)
- [ ] UI `/groups` (Screen 4)
- [ ] UI `/groups/:id` (Screen 5)
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
- [ ] Scene 2: demo user sees ≥ 3 matches with explanations → connects with one → creates "Thursday Makers" (private) → invites 2 → second seeded user accepts via API → roster shows 2 active

## P1

- [ ] Voting on planner suggestions (`POST /api/groups/:id/plans/:planId/vote`) — API done, UI pending
- [ ] Send a chosen `new_activity` suggestion to 04 as a group-originated proposal request
- [ ] Filters on `/match` by interest and social goal — API done (`?interest=&goal=`), UI pending
- [ ] Basic 1:1 messaging between accepted connections (text only, polled)
- [ ] Public group discovery (`/groups/discover`) — API done (`GET /api/groups?discover=1`), UI pending

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

## Needs from others

- Integrator: merge ws/01-core to main first. This branch carries byte-identical copies of 01's files and of 02's `0200_agent.sql`; after 01 lands, regenerate `src/lib/supabase/database.types.ts` on main (`pnpm db:types`) since every workstream regenerates it.
- 01/02 (README §4 `SharablePreferences`): add `interestCategories: EventCategory[]`. 02 already stores `interest_categories`, and 03 §5 and 06 §5 both score on it. Until then 03 derives categories from tags.
- 02: `supabase/seed/fixtures/preferences.json` (02 §8). Scene 2 and AC1 need seeded preferences and consent; 03's tests apply an interim copy of the 02 §8 design.

- 01: `src/lib/ai/prompts/index.ts` now lists `groups.plan_activities` (spec name) instead of the reserved `groups.plan_activity`, with its system prompt. `matching.explain_match` is unused: 03 explains matches through 02's `explainRecommendation`.
- 06: swap your 03 stubs for the real exports, same signatures: `getConnectionIds`, `getBlockEdges`, `getSuggestedPeople` from `@/features/matching`; `getGroupMemberIds`, `createEventInvitations`, `getPendingEventInviteeIds`, `getPendingEventInvitations`, `getPublicGroups` from `@/features/groups`.
- 06: `EventSummary` has no `category`, so the planner calls `getEventPublic` per candidate; adding `category` to `EventSummary` would remove those lookups. `getUpcomingEventsForUser` also does not say whether an RSVP is shared with attendees, so group pages show only a count of members going.

## Blocked

## Log

- 2026-10-24 16:45 CDT · landed: matches service + `GET /api/matches` with grounded explanations; connection, block and report routes; group services, invitations, removal, transfer, leave/archive; group planner (consent-gated aggregates, name scrubbing, validation, fallbacks) and votes; matching/groups contracts for 06. 112 unit+integration tests across 03 (63 unit, 57 integration incl. seed). Next: `/match`, `/groups`, `/groups/:id` UI, then the Scene 2 E2E.

- 2026-10-24 16:25 CDT · landed: progress file; 01 scaffold + 02 migration copies; 0300/0301 migrations (RLS, guards, service functions) with 18 integration tests; seed contribution (groups, 6 connections, a block) with 3 tests; compatibility scorer with 34 unit tests. Next: matches service + `GET /api/matches`, then connections, block and report routes.
