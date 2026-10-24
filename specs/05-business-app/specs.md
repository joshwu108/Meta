# Workstream 05 — Business Application

**Owner role:** Full-stack engineer (business side)
**Depends on:** 01 (auth, `withBusinessOwner`, shell), 04 (`event_proposals`, `demand_clusters`) — stubbed with fixtures until available
**Consumed by:** 04 (`findCandidateBusinesses`, `businesses` table), 06 (`events` table, `getBusinessPublicCard`)
**Read first:** [`../README.md`](../README.md) sections 2–5

---

## 1. Purpose

Local businesses are the other half of the marketplace. This workstream gives a café, pottery studio, or board-game shop a way to register, describe what they can host, receive AI-generated event proposals backed by aggregated community demand, and approve, edit, or reject them. It also lets businesses publish their own events, manage RSVPs, and see aggregated interest in their area. It owns the `events` table and the only code path that moves an event to `published`: **nothing AI-generated becomes a real event without a business owner's explicit approval of the final details.**

## 2. PRD Coverage

B-01..B-08 (P0), B-09, B-10 (P1); EAI-06..EAI-08 (delivery, decision, publication); Business Screens 1–5; Section 12.4 aggregation safety and 12.5 business approval; Workflow A steps 5–6; Demo Scene 4.

## 3. Scope

### In scope (P0)
- `/business/onboarding`: profile, address with geocoded coarse coordinates, category, hours, capacity, event capabilities, pricing preferences, hosting slots
- `/business` dashboard: pending proposals, upcoming events with RSVP counts, quick-create
- `/business/proposals` inbox and `/business/proposals/:id` detail: approve / edit & approve / reject with reason
- `/business/events`: list; `/business/events/new` and `/business/events/:id/edit` editor; publish, update, cancel
- `/business/events/:id/attendees`: counts always; names only for attendees who consented (`share_name_with_business`)
- Event status machine and the `events` table
- Contracts: `findCandidateBusinesses()`, `getBusinessPublicCard()`
- Notifications to RSVP'd users on event update/cancel (via 01's `notify`)

### P1
- `/business/insights`: aggregated community interest (banded) by category and slot within 3 km
- Analytics: past events, attendance, repeat attendees (count only)
- "Ask AI to revise" on a proposal (calls 04's revise endpoint)

### Out of scope
- Payments, ticketing, recurring events, promotions, multi-location businesses

## 4. Data Model (migrations `0500_business.sql`)

```sql
create table businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique,
  description text check (char_length(description) <= 1000),
  category text not null,                       -- primary EVENT_CATEGORY, e.g. 'creative'
  address text not null,
  neighborhood text,
  lat numeric(9,6) not null,                    -- exact venue location is public information
  lng numeric(9,6) not null,
  image_url text,
  hours jsonb not null default '{}',            -- { "mon": [["09:00","21:00"]], ... }
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index businesses_owner on businesses (owner_id);   -- MVP: one business per owner

create table business_capabilities (
  business_id uuid primary key references businesses(id) on delete cascade,
  event_categories text[] not null default '{}',  -- EVENT_CATEGORY values it can host
  capacity int not null check (capacity between 1 and 500),
  min_price_cents int,
  max_price_cents int,
  hosting_slots text[] not null default '{}',     -- AVAILABILITY_SLOT values
  equipment_tags text[] not null default '{}',    -- 'pottery-wheels','kiln','board-game-library','espresso-bar'
  formats text[] not null default '{}',           -- 'workshop','social-mixer','tournament','tasting'
  notes text check (char_length(notes) <= 500),
  accepts_ai_proposals boolean not null default true,
  updated_at timestamptz not null default now()
);

create table events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  proposal_id uuid,                             -- references event_proposals(id); FK added by whichever migration lands second
  source text not null check (source in ('ai_proposal','business_manual','group_request')),
  title text not null check (char_length(title) between 4 and 80),
  description text not null check (char_length(description) <= 1500),
  category text not null,
  format text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity int not null check (capacity between 1 and 500),
  price_cents int check (price_cents >= 0),     -- null = free / pay at venue
  status text not null default 'approved_draft'
    check (status in ('proposed','awaiting_approval','approved_draft','published','full','completed','cancelled')),
  published_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_time check (ends_at > starts_at)
);
create index on events (status, starts_at);
create index on events (business_id, starts_at desc);

-- FK from event_proposals (04) to businesses, added here if 04 landed first
alter table event_proposals add constraint proposals_business_fk foreign key (business_id) references businesses(id) on delete cascade;

alter table businesses enable row level security;
alter table business_capabilities enable row level security;
alter table events enable row level security;

create policy biz_public_read on businesses for select using (is_active);
create policy biz_owner_write on businesses for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy cap_owner on business_capabilities for all using (exists (select 1 from businesses b where b.id = business_id and b.owner_id = auth.uid()));
create policy cap_public_read on business_capabilities for select using (true);
create policy events_public_read on events for select using (status in ('published','full','completed'));
create policy events_owner_all on events for all using (exists (select 1 from businesses b where b.id = business_id and b.owner_id = auth.uid()));
```

Workstream 06 adds `rsvps` and the `events.status` transitions to `full` / `completed`. 05 owns every other transition.

## 5. Domain Logic (`src/features/business/server/`, `src/features/proposals/server/decide.ts`)

### Proposal decision (`decideProposal`)
Input: `{ proposalId, decision: 'approve' | 'modify' | 'reject', edits?: EventEdits, note?: string }`.
1. `withBusinessOwner` guarantees the proposal belongs to the caller's business and `status = 'pending'`; otherwise `CONFLICT`.
2. `reject` → `status='rejected'`, `decision_note`, `decided_at`. Log action.
3. `approve` / `modify` → build the event from `proposal` merged with `edits` (Zod `EventEdits`: title, description, startsAt, endsAt, capacity, priceCents, format). Validate against capabilities (capacity ≤ business capacity; starts within hours). Insert `events` with `source='ai_proposal'`, `status='approved_draft'`, `proposal_id`. Set proposal `status` to `approved` or `modified`, `business_edits = edits`, `resulting_event_id`. All in one transaction (Postgres function `decide_proposal(...)` called via RPC).
4. If body contains `publish: true`, immediately call `publishEvent`.

### Publish (`publishEvent`)
`approved_draft → published`, `published_at = now()`. Then fan-out notifications: for an `ai_proposal` event, notify users in the originating `demand_cluster_members` (service role, ids never returned to the caller) with `event_published`; 06's recommendation feed picks the event up on next load. Log `{ actor: 'planning_agent', action: 'publish_event' }`.

### Update (`updateEvent`)
Allowed while `published`/`full`. Changes to `starts_at`, `ends_at`, `price_cents`, or `capacity` set `events.updated_at` and notify every confirmed RSVP with `event_updated`; 06 shows a "details changed, please reconfirm" banner (06 owns the reconfirm). Capacity decrease below confirmed count is rejected with `VALIDATION`.

### Cancel
`published`/`full`/`approved_draft → cancelled`, requires `cancel_reason`; notifies confirmed RSVPs with `event_cancelled`.

### `findCandidateBusinesses(criteria: VenueCriteria): Promise<BusinessMatch[]>`
SQL prefilter: `is_active`, `accepts_ai_proposals`, `criteria.category = any(event_categories)`, `capacity >= cohortSize`, haversine ≤ `radiusKm`. Score per 04 §5.6 (04 owns the weighting, 05 owns the query); return top 5 with `reasons` such as "Hosts creative events", "Capacity 12", "Open Thursday evenings".

### `getBusinessPublicCard(id)` → `BusinessPublicCard` (no owner id, no capabilities notes).

## 6. API

| Route | Notes |
|---|---|
| `POST /api/business` | Create business + capabilities in one transaction (onboarding submit). Geocode address server-side with a static neighborhood lookup for the demo (no external API required); accept `lat/lng` override |
| `GET /api/business/me` / `PATCH` | Profile and capabilities |
| `GET /api/business/proposals?status=pending` | List with `demand.band`, `title`, `suggestedStartsAt`, `created_at`, `expires_at` |
| `GET /api/business/proposals/:id` | Full `ProposalDocument` + cluster aggregate (banded) + `business_edits` |
| `PATCH /api/business/proposals/:id` | `{ decision, edits?, note?, publish? }` → `{ proposal, event? }` |
| `POST /api/business/events` | Manual event, `source='business_manual'`, status `approved_draft` or `published` if `publish: true` |
| `PATCH /api/business/events/:id` | Edit allowed fields; triggers update notifications |
| `POST /api/business/events/:id/publish` | |
| `POST /api/business/events/:id/cancel` | `{ reason }` |
| `GET /api/business/events` | Mine, with `confirmedCount` (06's `rsvps`; 0 until 06 lands) |
| `GET /api/business/events/:id/attendees` | `{ confirmedCount, waitlistedCount, attendees: [{ displayName \| null, sharedInterests?: string[] }] }` — name only when the RSVP's `share_with_business = true` (06 sets it from 02's consent) |
| `GET /api/business/insights` (P1) | Banded demand by category × slot within 3 km from `demand_clusters` of the last 30 days |

All routes use `withBusinessOwner` except `POST /api/business` (which uses `withAuth`).

## 7. UI

Design: same token set as the consumer app but a denser, more utilitarian rhythm; the accent marks AI suggestions consistently with a small "AI suggestion" tag and sparkle glyph so the owner always knows what is a proposal versus a confirmed event.

### `/business/onboarding` (Business Screen 1)
Four short steps: **Profile** (name, description, category, image URL) → **Location & hours** (address, neighborhood picker, weekly hours grid) → **What you can host** (categories multi-select, capacity, price range, hosting slots grid, equipment/format chips, free-text notes, "Accept AI event proposals" toggle, on by default) → **Review**.

### `/business` (Screen 2)
- Hero stat row: pending proposals, upcoming events, RSVPs this month
- "AI proposals waiting" list (title, band, slot, Review button)
- Upcoming events with RSVP progress bars
- Quick-create event button

### `/business/proposals/:id` (Screen 3)
- Left: proposal card — title, description, format, intended social experience, suggested time, duration, capacity, price, "Estimated local interest: 6–9 people nearby interested in creative activities on Thursday evenings" with an info popover explaining it is an opt-in, aggregated estimate, not RSVPs
- "Why this was suggested" block and "Assumptions to confirm" checklist (owner can tick them; informational)
- Right: **Decision panel** — Approve as-is · Edit & approve (opens editor prefilled) · Reject (reason select + note). After approve: "Publish now" or "Save as draft"
- Status timeline at the top (Proposed → Awaiting your approval → Approved → Published)

### `/business/events/new`, `/business/events/:id/edit` (Screen 4)
Fields: title, description, category, format, date, start/end time, capacity, price, publication controls. Validation messages inline. When editing a published event with RSVPs, show a warning that attendees will be notified to reconfirm.

### `/business/events`, `/business/events/:id/attendees` (Screen 5)
Table of events with status pills, RSVP counts, actions (edit, publish, cancel). Attendee page shows counts first, then the consented list; non-consenting attendees appear as "Attendee (private)".

## 8. Seed Contribution

Extend `businesses.json` with capabilities: Kiln & Cup (creative; capacity 12; $1500–$3500; thu_eve, sat_day; pottery-wheels, kiln; workshop), Ritual Grounds (food_drink, community; capacity 20; $0–$1500; all evenings; espresso-bar; social-mixer, tasting), Meeple House (games; capacity 30; $500–$1500; fri_eve, sat_eve, sun_day; board-game-library; tournament, social-mixer). Add `proposals.json` with one pre-seeded pending proposal for Ritual Grounds so the inbox is non-empty before Scene 3 runs.

## 9. Tests

| Layer | Cases |
|---|---|
| Unit | status machine (every illegal transition rejected); edits validation against capabilities; capacity decrease below confirmed rejected; attendee name masking; `findCandidateBusinesses` prefilter and ordering; demand band never a raw number in any DTO (property test over DTO builders) |
| Integration | owner-only access to proposals and events (other owner → `NOT_FOUND`); `decide_proposal` RPC is atomic (simulate failure after proposal update, assert rollback); approve creates `approved_draft` event linked to proposal; publish notifies cluster members without exposing ids; cancel notifies RSVPs; public can read only published/full/completed events |
| E2E | Scene 4: log in as Kiln & Cup owner → dashboard shows pending pottery proposal → open → Edit & approve: price $20 → $25, time 18:30 → Publish now → event list shows Published |

## 10. Acceptance Criteria

1. A business can complete onboarding and appears in 06's nearby businesses.
2. The pottery proposal appears in the inbox with banded demand and a clear "estimate" label; approve, edit & approve, and reject all work and are atomic.
3. No route in this workstream returns user ids, raw cohort counts, or non-consented names.
4. Publishing an approved proposal makes the event visible to consumers (06) and notifies the originating cohort.
5. Editing a published event notifies attendees and cannot shrink below confirmed RSVPs.

## 11. Independence Notes

- Until 04 lands: a `tests/fixtures/proposals/*.json` set and a dev-only `POST /api/dev/proposals` that inserts a fixture proposal for the current business.
- Until 06 lands: `confirmedCount` reads `rsvps` if present else 0 (guarded query).

## 12. Risks

| Risk | Mitigation |
|---|---|
| Owner mistakes AI estimate for confirmed demand | Band + "estimate" copy + popover; no raw numbers anywhere |
| Migration ordering with 04 (`event_proposals.business_id` FK) | FK added in whichever lands second, guarded by `if exists`; integration test asserts the FK exists after full reset |
| Status machine bypassed by direct updates | Transitions only via RPC functions; RLS update policy on `events` for owners is restricted to non-status columns via a trigger that rejects direct status changes outside the RPCs |
