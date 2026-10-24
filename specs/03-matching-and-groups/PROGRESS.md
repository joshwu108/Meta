# Workstream 03 — Progress

Branch: `ws/03-matching`. Spec: [`specs.md`](./specs.md). Shared contracts: [`../README.md`](../README.md).

## Foundations (unblock others first)

- [x] Migration `0300_social.sql` (tables, RLS) + `0301_social_functions.sql` (guard triggers, service-role functions)
- [ ] Contracts: `getCompatibilityScore()` from `src/features/matching/index.ts`, `getGroupMemberIds()` from `src/features/groups/index.ts`
- [ ] Helpers 06 asked for: `getConnectionIds`, `getBlockEdges`, event-invitation create/read, top matches for Discover, public groups
- [ ] Zod schemas for request bodies, rows and DTOs
- [ ] Stubs for 02 (`getSharablePreferences`, `explainRecommendation`) and 06 (`getUpcomingEventsForUser`) in `server/stubs.ts`
- [ ] MOCK_AI fixture `groups.plan_activities.json`

## Acceptance criteria (P0, spec §10)

- [ ] AC1. Seeded demo user receives ranked matches whose top 3 share `creative` interests and `thu_eve`
- [ ] AC2. Every match card shows an explanation grounded in shared fields
- [ ] AC3. Connection, block, report, group create/invite/accept/remove/leave all work and respect authorization
- [ ] AC4. Group planner produces 2–4 suggestions referencing only shared slots and consenting members' data
- [ ] AC5. A group can view upcoming events (through 06's contract) and open them

## Build items (P0, spec §3, §6, §7)

- [ ] Compatibility engine: hard filters, weighted score (35/25/20/10/10), explanation
- [ ] `GET /api/matches`: candidate set (≤ 500), 5-minute per-viewer cache, top 20
- [ ] `POST /api/connections`, `PATCH /api/connections/:id`, `GET /api/connections`
- [ ] `POST /api/users/:id/block`, `POST /api/users/:id/report`
- [ ] `POST /api/groups`, `GET /api/groups`, `GET /api/groups/:id`, `PATCH /api/groups/:id`
- [ ] `POST /api/groups/:id/invite`, `PATCH /api/invitations/:id`
- [ ] `DELETE /api/groups/:id/members/:userId`, `POST /api/groups/:id/leave` (with owner transfer)
- [ ] `POST /api/groups/:id/plan` (group planner)
- [ ] UI `/match` (Screen 3)
- [ ] UI `/groups` (Screen 4)
- [ ] UI `/groups/:id` (Screen 5)
- [x] Seed: group members, `connections.json` (6 accepted edges), one block pair

## Tests (spec §9)

### Unit
- [x] Score components with golden values: identical users = 100, disjoint = 0, adjacent group size = 0.5
- [x] Hard filters
- [x] Haversine
- [ ] Planner pre-work: slot intersection, budget envelope
- [ ] Suggestion validation drops bad event ids and slots

### Integration
- [ ] Matches exclude non-discoverable, non-consenting, blocked, already-connected
- [x] Connection uniqueness constraint
- [ ] Recipient-only accept
- [ ] Block declines pending and hides both ways
- [ ] Private group invisible to non-members
- [ ] Owner cannot be removed
- [ ] Leave with transfer
- [ ] Planner refuses with < 2 consenting members
- [ ] Planner never includes names in prompt input (assert on captured mock input)

### E2E
- [ ] Scene 2: demo user sees ≥ 3 matches with explanations → connects with one → creates "Thursday Makers" (private) → invites 2 → second seeded user accepts via API → roster shows 2 active

## P1

- [ ] Voting on planner suggestions (`POST /api/groups/:id/plans/:planId/vote`)
- [ ] Send a chosen `new_activity` suggestion to 04 as a group-originated proposal request
- [ ] Filters on `/match` by interest and social goal
- [ ] Basic 1:1 messaging between accepted connections (text only, polled)
- [ ] Public group discovery (`/groups/discover`)

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

## Needs from others

- Integrator: merge ws/01-core to main first. This branch carries byte-identical copies of 01's files and of 02's `0200_agent.sql`; after 01 lands, regenerate `src/lib/supabase/database.types.ts` on main (`pnpm db:types`) since every workstream regenerates it.
- 01/02 (README §4 `SharablePreferences`): add `interestCategories: EventCategory[]`. 02 already stores `interest_categories`, and 03 §5 and 06 §5 both score on it. Until then 03 derives categories from tags.
- 02: `supabase/seed/fixtures/preferences.json` (02 §8). Scene 2 and AC1 need seeded preferences and consent; 03's tests apply an interim copy of the 02 §8 design.

## Blocked

## Log

- 2026-10-24 16:25 CDT · landed: progress file; 01 scaffold + 02 migration copies; 0300/0301 migrations (RLS, guards, service functions) with 18 integration tests; seed contribution (groups, 6 connections, a block) with 3 tests; compatibility scorer with 34 unit tests. Next: matches service + `GET /api/matches`, then connections, block and report routes.
