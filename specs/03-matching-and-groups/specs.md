# Workstream 03 — People Matching, Connections & Groups

**Owner role:** Full-stack engineer (social graph)
**Depends on:** 01 (auth, envelope, profiles), 02 (`getSharablePreferences`, `explainRecommendation`) — stubbed until available
**Consumed by:** 04 (P1 group-originated proposals), 06 (group invites to events, attendee connections)
**Read first:** [`../README.md`](../README.md) sections 2–5

---

## 1. Purpose

This workstream turns preferences into a social graph. It computes compatibility between consenting, discoverable users with a deterministic weighted ranking, explains each recommendation, handles connection requests, blocking and reporting, and gives users the tools to form their own communities: public interest groups and private friend groups, with invitations, roles, and an AI activity planner that works only from consented member preferences.

## 2. PRD Coverage

M-01..M-04, M-07 (P0), M-05, M-06, M-08 (P1); G-01..G-08, G-12, G-13 (P0), G-09, G-10, G-11 (P1); Screens 3, 4, 5; Section 8.1 component 2 (Compatibility & Coordination Engine); Section 8.3 (matching logic); Workflows B, C, D; Section 12.3 (social safety).

## 3. Scope

### In scope (P0)
- Compatibility engine: hard filters + weighted score (35/25/20/10/10) + explanation
- `/match`: recommended people cards, incoming/outgoing requests tabs
- Connection request lifecycle: send, accept, decline, list
- Block and report (blocked users vanish from all recommendations and group invite pickers in both directions)
- Groups: create, edit, public/private, roster, roles (owner/admin/member), invite, accept/decline, remove member, leave
- `/groups` and `/groups/:id` screens
- Group AI planner: "Plan something for us" → suggestions built from consented member preferences, including existing events from 06 and new activity ideas
- Contracts: `getCompatibilityScore()`, `getGroupMemberIds()`

### P1
- Simple voting on planner suggestions
- Send a chosen new-activity suggestion to 04 as a group-originated proposal request
- Filters on `/match` by interest and social goal
- Basic 1:1 messaging between accepted connections (text only, polled)
- Public group discovery (`/groups/discover`), and joining a public interest group from its page

### Out of scope
- Real-time messaging, read receipts, media; recommendation model training

## 4. Data Model (migrations `0300_social.sql`)

```sql
create table connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references profiles(id) on delete cascade,
  recipient_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  message text check (char_length(message) <= 280),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint connections_distinct check (requester_id <> recipient_id)
);
-- one live edge per unordered pair
create unique index connections_pair on connections (least(requester_id, recipient_id), greatest(requester_id, recipient_id));

create table blocks (
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles(id) on delete cascade,
  reported_id uuid not null references profiles(id) on delete cascade,
  reason text not null check (reason in ('harassment','spam','fake','safety','other')),
  details text check (char_length(details) <= 1000),
  created_at timestamptz not null default now()
);

create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  description text check (char_length(description) <= 1000),
  interests text[] not null default '{}',
  visibility text not null default 'private' check (visibility in ('public','private')),
  kind text not null default 'interest' check (kind in ('interest','private','event')),
  event_id uuid,                                     -- set for kind = 'event' (FK added by 06 in 06xx migration)
  creator_id uuid not null references profiles(id) on delete cascade,
  archived_at timestamptz,                           -- set when the last member (the owner) leaves
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table group_members (
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  status text not null default 'invited' check (status in ('invited','active','removed','left')),
  joined_at timestamptz,
  primary key (group_id, user_id)
);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('group','event')),
  group_id uuid references groups(id) on delete cascade,
  event_id uuid,                                     -- FK added by 06
  sender_id uuid not null references profiles(id) on delete cascade,
  recipient_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','expired')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
create index on invitations (recipient_id, status);

create table group_plans (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  requested_by uuid references profiles(id) on delete set null,
  request_text text not null,
  suggestions jsonb not null,                        -- PlanSuggestion[] (see §5)
  members_included int not null,                     -- count of consenting members used
  created_at timestamptz not null default now()
);

create table group_plan_votes (                      -- P1
  plan_id uuid not null references group_plans(id) on delete cascade,
  suggestion_index int not null,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (plan_id, suggestion_index, user_id)
);
```

### RLS

Policies on the group tables call security-definer helpers (`is_group_member(group, statuses)`, `is_group_admin(group)`, `can_read_group(group)`), because a policy on `group_members` that selects `group_members` recurses. Block and reachability checks use helpers that only answer for the caller (`is_blocked_with(other)`, `can_reach(other)`). Implemented in `0300_social.sql`, `0301_social_functions.sql` (guard triggers and service-role write functions) and `0303_social_reachability.sql`.

```sql
-- connections: either party can read; only the requester inserts (not across a block, only to a
-- discoverable person or someone in a shared active group); only the recipient updates status
create policy conn_read on connections for select using (auth.uid() in (requester_id, recipient_id));
create policy conn_insert on connections for insert with check (
  auth.uid() = requester_id and status = 'pending' and not is_blocked_with(recipient_id) and can_reach(recipient_id));
create policy conn_respond on connections for update using (auth.uid() = recipient_id);

create policy blocks_self on blocks for all using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);
create policy reports_insert on reports for insert with check (auth.uid() = reporter_id);

-- groups: public groups readable by all authenticated; private only by active/invited members; archived by nobody
create policy groups_read on groups for select using (can_read_group(id));
create policy groups_insert on groups for insert with check (auth.uid() = creator_id);
create policy groups_admin_update on groups for update using (is_group_admin(id));

create policy members_read on group_members for select using (can_read_group(group_id));
-- member writes go through server functions using the admin client after explicit authorization checks

create policy inv_read on invitations for select using (auth.uid() in (sender_id, recipient_id));
create policy inv_respond on invitations for update using (auth.uid() = recipient_id);

create policy plans_read on group_plans for select using (is_group_member(group_id, array['active']));
```

## 5. Matching & Planning Logic

### Candidate set
Users where `profiles.is_discoverable = true`, `getSharablePreferences(id, 'matching')` is non-null, not the viewer, not blocked in either direction, not already connected (accepted or pending), and within `min(viewer.travelRadiusKm, candidate.travelRadiusKm)` of the viewer by haversine on coarse coordinates. For the MVP the candidate set is computed per request over at most 500 discoverable users; cache results per viewer for 5 minutes in memory.

### Hard filters (never compensated by score)
- Distance beyond either user's travel radius
- Either side blocked the other
- Candidate not consented / not discoverable
- Candidate `is_adult_confirmed = false`

### Score (`getCompatibilityScore(a, b): CompatibilityResult`)

| Component | Weight | Computation |
|---|---:|---|
| interests | 0.35 | Jaccard over normalized `interests` ∪ `interestCategories`, with category overlap counted at 0.5 |
| availability | 0.25 | `|shared slots| / min(|a.slots|, |b.slots|)`, 0 if either empty |
| social | 0.20 | 0.6 × social-goal Jaccard + 0.4 × group-size proximity (same = 1, adjacent = 0.5, else 0) |
| location | 0.10 | `1 − distanceKm / maxRadiusKm`, clamped to [0,1] |
| budget & activity | 0.10 | 0.5 × budget-range overlap ratio (1 if either is null) + 0.5 × activity-pref Jaccard |

Score is 0–100, rounded. Weights live in `src/features/matching/server/weights.ts` as named constants and are the only place to tune. Return top 20 by score with `sharedInterests` and `sharedSlots` populated; each card's explanation comes from 02's `explainRecommendation()` (fast model, cached 24h keyed by `(viewer, candidate, prefsHash)`).

### Group planner (`POST /api/groups/:id/plan`)
1. Authorize: requester is an active member; owners/admins may always plan; members may plan if `groups.visibility = 'public'` or they are the creator.
2. Collect `getSharablePreferences(memberId, 'group_plan')` for active members; count consenting members. If fewer than 2 consent, return `VALIDATION` "Not enough members have allowed group planning."
3. Deterministic pre-work: intersect availability slots, compute budget envelope (min of maxes), merge interests with counts, pick centroid of coarse locations.
4. Fetch candidate existing events from 06's `getUpcomingEventsForUser()` for the requester filtered to the shared slots and categories (stub until 06 ships).
5. Prompt `groups.plan_activities` (smart):
   ```ts
   const PlanSuggestion = z.object({
     kind: z.enum(['existing_event','new_activity']),
     eventId: z.string().uuid().nullable(),
     title: z.string(), description: z.string().max(300),
     category: z.enum(EVENT_CATEGORY), slot: z.enum(AVAILABILITY_SLOT),
     estimatedCostCents: z.number().int().nullable(),
     whyItFits: z.string().max(200),
     needsVenue: z.boolean(),
   });
   output: z.object({ suggestions: z.array(PlanSuggestion).min(2).max(4) })
   ```
   The model receives only aggregated data (interest counts, shared slots, budget envelope, neighborhood centroid label, candidate events). It never sees member names or individual preference rows.
6. Validate: any `existing_event` id must be in the candidate list; `slot` must be in the shared slots; else drop the suggestion. Store in `group_plans`, log `agent_action_log { actor: 'coordination', action: 'group_plan', permissions_used: ['group_plan'] }` for each consenting member.
7. P1: votes; a `new_activity` with `needsVenue` and ≥ 50% votes can be sent to 04 via `POST /api/ai/generate-opportunities { source: 'group', groupId, planId, suggestionIndex }`.

## 6. API

| Route | Notes |
|---|---|
| `GET /api/matches?interest=&goal=&limit=20` | Returns `MatchCard[]`: `{ user: PublicCard, score, breakdown, sharedInterests, sharedSlots, explanation }` |
| `POST /api/connections` | `{ recipientId, message? }` → 201; `CONFLICT` if edge exists; notifies recipient |
| `PATCH /api/connections/:id` | `{ status: 'accepted' \| 'declined' }`; recipient only; notifies requester on accept |
| `GET /api/connections?status=` | both directions, with public cards |
| `POST /api/users/:id/block` | inserts block, declines any pending connection, removes from shared private groups' invite lists |
| `POST /api/users/:id/report` | `{ reason, details? }` |
| `POST /api/groups` | `{ name, description?, interests[], visibility }` → creator becomes `owner`/`active` |
| `GET /api/groups` | mine (active + invited), plus `?discover=1` for public groups (P1) |
| `GET /api/groups/:id` | group, roster (public cards), my role, upcoming events (from 06, stubbed), latest plan |
| `PATCH /api/groups/:id` | admins; name/description/interests/visibility |
| `POST /api/groups/:id/invite` | `{ userIds: string[] }`; admins, or any active member for public groups; skips blocked pairs; creates `invitations` + `group_members(status='invited')`; notifies |
| `PATCH /api/invitations/:id` | `{ status }`; accept → `group_members.status='active', joined_at=now()` |
| `DELETE /api/groups/:id/members/:userId` | admins remove; owner cannot be removed |
| `POST /api/groups/:id/leave` | owner must transfer first (`PATCH` with `{ transferOwnerTo }`) or be last member (group archived) |
| `POST /api/groups/:id/join` | P1: anyone signed in joins a public interest group as `member`; rejoining after leaving is allowed; removed members need a new invite (`FORBIDDEN`); active members get `CONFLICT`, invitees answer their invitation (`VALIDATION`) |
| `POST /api/groups/:id/plan` | `{ request: string }` → `GroupPlan` |
| `POST /api/groups/:id/plans/:planId/vote` | P1 `{ suggestionIndex }` toggle |
| `GET/POST /api/connections/:id/messages` | P1 text messages between accepted connections; `?after=` for polling |

## 7. UI

### `/match` (Screen 3)
- Card stack/grid of `MatchCard`s in the shared Meta-aligned system ([`../design-system.md`](../design-system.md)): white card, avatar, name, neighborhood, compatibility score as a blue ring, shared-interest chips, one-line explanation under an `AiTag`, "Why this match?" disclosure with blue breakdown bars, primary blue **Connect** (opens optional message) and overflow menu (Block, Report)
- Tabs: Recommended · Requests (incoming with Accept/Decline, outgoing with Pending)
- Empty states: not discoverable → CTA to permissions; no candidates → suggest widening radius
- Clear copy under the heading: "Scores reflect shared preferences, not a guarantee you'll click."

### `/groups` (Screen 4)
- Sections: Invitations (accept/decline inline), My groups (cards with member avatars, next plan), Create group button → modal (name, description, interests chips, public/private radio with explanation)

### `/groups/:id` (Screen 5)
- Header with name, visibility badge, interests, member avatars
- Tabs: **Plans** (AI planner input "What should we do?" + suggestions with vote buttons and "RSVP" / "Request venue" actions), **Events** (from 06), **Members** (roster, roles, invite picker searching connections and matches, remove/leave controls)
- Planner shows "Based on 4 of 5 members who allow group planning" so consent is visible

## 8. Seed Contribution

Extend `groups.json` with members; add `connections.json` (6 accepted edges among seeded users, 2 pending to the demo user once created in Scene 2 is done live, so none for `demo.new`). Add one block pair to prove the filter.

## 9. Tests

| Layer | Cases |
|---|---|
| Unit | score components with golden values (identical users = 100, disjoint = 0, adjacent group size = 0.5); hard filters; haversine; planner pre-work (slot intersection, budget envelope); suggestion validation drops bad event ids/slots |
| Integration | matches exclude non-discoverable, non-consenting, blocked, already-connected; connection uniqueness constraint; recipient-only accept; block declines pending and hides both ways; private group invisible to non-members; owner cannot be removed; leave with transfer; planner refuses with < 2 consenting members; planner never includes names in prompt input (assert on captured mock input) |
| E2E | Scene 2: demo user sees ≥ 3 matches with explanations → connects with one → creates "Thursday Makers" (private) → invites 2 → second seeded user accepts via API → roster shows 2 active |

## 10. Acceptance Criteria

1. Seeded demo user receives ranked matches whose top 3 share `creative` interests and `thu_eve`.
2. Every match card shows an explanation grounded in shared fields.
3. Connection, block, report, group create/invite/accept/remove/leave all work and respect authorization.
4. Group planner produces 2–4 suggestions referencing only shared slots and consenting members' data.
5. A group can view upcoming events (through 06's contract) and open them.

## 11. Independence Notes

- Stubs in `src/features/matching/server/stubs.ts`: `getSharablePreferences` reading `user_preferences` directly via admin client (replace with 02's export), `explainRecommendation` returning a templated string, `getUpcomingEventsForUser` returning seeded events.
- `MOCK_AI` fixtures: `groups.plan_activities.json`.

## 12. Risks

| Risk | Mitigation |
|---|---|
| O(n²) scoring as users grow | Prefilter by radius and shared category in SQL; cap candidates at 500; cache per viewer |
| Explanations drift from score facts | Explanations receive the deterministic breakdown and are post-checked by 02 |
| Group planner leaks individual preferences | Only aggregated inputs reach the model; integration test inspects captured prompt input |
