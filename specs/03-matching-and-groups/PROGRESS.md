# Workstream 03 — Progress

Branch: `ws/03-matching`. Spec: [`specs.md`](./specs.md). Shared contracts: [`../README.md`](../README.md).

## Foundations (unblock others first)

- [ ] Migration `0300_social.sql`: connections, blocks, reports, groups, group_members, invitations, group_plans, group_plan_votes, RLS
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
- [ ] Seed: group members, `connections.json` (6 accepted edges), one block pair

## Tests (spec §9)

### Unit
- [ ] Score components with golden values: identical users = 100, disjoint = 0, adjacent group size = 0.5
- [ ] Hard filters
- [ ] Haversine
- [ ] Planner pre-work: slot intersection, budget envelope
- [ ] Suggestion validation drops bad event ids and slots

### Integration
- [ ] Matches exclude non-discoverable, non-consenting, blocked, already-connected
- [ ] Connection uniqueness constraint
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

## Needs from others

## Blocked

## Log
