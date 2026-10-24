# Workstream 06 — Events, Discovery, RSVP & Follow-ups

**Owner role:** Full-stack engineer (consumer events)
**Depends on:** 01 (auth, shell, `notify`), 02 (`getSharablePreferences(·,'matching')`, `explainRecommendation`, `follow_up_suggestion`), 03 (`getGroupMemberIds`, `invitations`), 05 (`events`, `businesses`, `getBusinessPublicCard`) — stubbed until available
**Consumed by:** 03 (`getUpcomingEventsForUser`), 05 (`rsvps` counts), 02 (event suggestion cards)
**Read first:** [`../README.md`](../README.md) sections 2–5

---

## 1. Purpose

This workstream is where plans become attendance. It gives consumers a personalized event feed with explanations, event details with venue information, a transactional RSVP flow that enforces capacity, visibility into fellow attendees that respects everyone's sharing settings, group invitations to events, a "My Activity" hub, and the post-event loop: feedback, mutual reconnect interest, and an AI-suggested follow-up meetup. It also provides the Discover home screen and nearby business listing.

## 2. PRD Coverage

D-01..D-04 (P0), D-05..D-08 (P1); EV-01..EV-07 (P0), EV-08..EV-10 (P1); Screens 2, 6, 8; Workflow A steps 7–9; Section 12.1 location privacy and 12.3 social safety; Demo Scenes 5 and 6.

## 3. Scope

### In scope (P0)
- `/discover` home: recommended events (with why), suggested people (03's top 3), nearby businesses, recommended groups (public groups from 03), AI social suggestion strip (02 cards)
- `/events` feed and `/events/:id` detail
- `GET /api/events/recommended` ranking + explanations
- RSVP create/cancel with capacity enforced in a Postgres function; `published ⇄ full` transitions
- Attendee list with consent-aware visibility
- Invite a group to an event (creates `invitations(kind='event')` for active members)
- `/activity`: upcoming RSVPs, past events, connection requests (03 data), notifications
- Reconfirm banner when 05 edits a published event
- `GET /api/businesses/nearby`
- Scene 6 support: mark event completed (business or `DEMO_MODE` operator), feedback, reconnect interest, follow-up suggestion display

### P1
- Filters (category, date, distance), list/map toggle (static map tiles), bookmarks, waitlist with auto-promotion on cancel, public group discovery surfacing

### Out of scope
- Payments/tickets, calendar sync, real-time presence

## 4. Data Model (migrations `0600_events_rsvp.sql`)

```sql
create table rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'confirmed' check (status in ('confirmed','cancelled','waitlisted')),
  share_with_attendees boolean not null default false,   -- snapshot of consent at RSVP time
  share_with_business boolean not null default false,
  needs_reconfirm boolean not null default false,          -- set by 05's updateEvent notification handler
  event_version_seen timestamptz,                          -- events.updated_at at (re)confirmation
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id)
);
create index on rsvps (user_id, status);
create index on rsvps (event_id, status);

create table event_feedback (
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  met_someone boolean,
  comment text check (char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table reconnect_interest (
  event_id uuid not null references events(id) on delete cascade,
  from_user_id uuid not null references profiles(id) on delete cascade,
  to_user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, from_user_id, to_user_id),
  check (from_user_id <> to_user_id)
);

create table follow_up_suggestions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  user_a uuid not null references profiles(id) on delete cascade,
  user_b uuid not null references profiles(id) on delete cascade,
  suggestion jsonb not null,            -- { title, description, suggestedSlot, suggestedBusinessCategory, businessId? }
  status text not null default 'suggested' check (status in ('suggested','accepted_a','accepted_b','accepted_both','dismissed')),
  created_at timestamptz not null default now(),
  unique (event_id, user_a, user_b)
);

create table bookmarks (                 -- P1
  user_id uuid not null references profiles(id) on delete cascade,
  target_type text not null check (target_type in ('event','business')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);

-- deferred FKs from 03's tables
alter table groups add constraint groups_event_fk foreign key (event_id) references events(id) on delete set null;
alter table invitations add constraint invitations_event_fk foreign key (event_id) references events(id) on delete cascade;

alter table rsvps enable row level security;
alter table event_feedback enable row level security;
alter table reconnect_interest enable row level security;
alter table follow_up_suggestions enable row level security;
create policy rsvp_self on rsvps for select using (auth.uid() = user_id);
create policy feedback_self on event_feedback for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy reconnect_self on reconnect_interest for all using (auth.uid() = from_user_id) with check (auth.uid() = from_user_id);
create policy followup_parties on follow_up_suggestions for select using (auth.uid() in (user_a, user_b));
-- rsvp inserts/updates go through the RPC below (security definer) so capacity is enforced atomically
```

### Capacity-safe RSVP (Postgres)

```sql
create or replace function rsvp_event(p_event_id uuid, p_share_attendees boolean, p_share_business boolean)
returns table (rsvp_status text, event_status text) language plpgsql security definer as $$
declare v_event events%rowtype; v_confirmed int; v_status text;
begin
  select * into v_event from events where id = p_event_id for update;        -- row lock serializes RSVPs per event
  if v_event.status not in ('published','full') then raise exception 'EVENT_NOT_OPEN'; end if;
  if v_event.starts_at < now() then raise exception 'EVENT_STARTED'; end if;
  select count(*) into v_confirmed from rsvps where event_id = p_event_id and status = 'confirmed';
  v_status := case when v_confirmed < v_event.capacity then 'confirmed' else 'waitlisted' end;
  insert into rsvps (event_id, user_id, status, share_with_attendees, share_with_business, event_version_seen)
    values (p_event_id, auth.uid(), v_status, p_share_attendees, p_share_business, v_event.updated_at)
    on conflict (event_id, user_id) do update set status = excluded.status, updated_at = now(), needs_reconfirm = false, event_version_seen = excluded.event_version_seen
    where rsvps.status = 'cancelled';
  if not found then raise exception 'ALREADY_RSVPED'; end if;
  if v_status = 'confirmed' and v_confirmed + 1 >= v_event.capacity then update events set status = 'full' where id = p_event_id; end if;
  return query select v_status, (select status from events where id = p_event_id);
end $$;

create or replace function cancel_rsvp(p_event_id uuid) returns void language plpgsql security definer as $$
begin
  perform 1 from events where id = p_event_id for update;
  update rsvps set status = 'cancelled', updated_at = now() where event_id = p_event_id and user_id = auth.uid() and status in ('confirmed','waitlisted');
  -- P1: promote first waitlisted
  update events set status = 'published' where id = p_event_id and status = 'full'
    and (select count(*) from rsvps where event_id = p_event_id and status = 'confirmed') < capacity;
end $$;
```

The MVP maps `waitlisted` to the P1 waitlist; in P0 the route returns `CAPACITY_FULL` instead of inserting a waitlisted row (flag `WAITLIST_ENABLED`).

## 5. Recommendation Logic (`src/features/events/server/recommend.ts`)

Input: viewer's `SharablePreferences` (via 02, purpose `matching`; if null fall back to non-personalized ordering by distance and date) and candidate events: `status in ('published','full')`, `starts_at` in the next 21 days, venue within `travelRadiusKm`.

Score 0–100 = 40 × category/interest match (1 if event category ∈ `interestCategories`, +0.5 bonus if any interest tag appears in title/description) + 25 × slot match (event's weekday/time maps to a slot in `availabilitySlots`) + 15 × budget fit (price ≤ budgetMax or free) + 10 × proximity + 10 × social fit (capacity bucket vs `groupSizePref`, and +bonus if connections or group members have RSVP'd). Hard filter: events the user cancelled RSVP for are deprioritized, not hidden; blocked users' RSVPs never influence scores.

Each card gets an explanation from 02's `explainRecommendation({ viewer, target: event, breakdown })`, e.g. "Pottery night on a Thursday evening, small group, within your budget." Cached per `(user, event, prefsHash)`.

"Friends going" is computed only from accepted connections (03) whose RSVP has `share_with_attendees = true`.

## 6. API

| Route | Notes |
|---|---|
| `GET /api/events?category=&from=&to=&radiusKm=&page=` | Public feed (published/full), paginated; each item is `EventSummary` plus `confirmedCount`, `isFull`, `friendsGoing` |
| `GET /api/events/recommended?limit=10` | Scored list with `explanation` and `breakdown` |
| `GET /api/events/:id` | `EventPublic` + my RSVP + `needsReconfirm` + venue card + `attendeePreview` (count + up to 5 consented avatars) |
| `POST /api/events/:id/rsvp` | `{ shareWithAttendees?: boolean, shareWithBusiness?: boolean }` (defaults from 02 consent) → `{ status }`; `CAPACITY_FULL` when full and waitlist disabled; notifies `rsvp_confirmed`; logs nothing to agent log (user action, not AI) |
| `DELETE /api/events/:id/rsvp` | Cancel |
| `POST /api/events/:id/reconfirm` | Clears `needs_reconfirm`, records `event_version_seen` |
| `GET /api/events/:id/attendees` | Requires my confirmed RSVP; returns `{ count, attendees: [{ userId?, displayName?, avatarUrl?, sharedInterests?, isConnection }] }` — identity only for `share_with_attendees = true` rows, `sharedInterests` only if both have `share_interests_with_attendees`; blocked users excluded both ways |
| `POST /api/events/:id/invite-group` | `{ groupId }`; caller must be an active member; creates `invitations(kind='event')` for other active members (skipping those already RSVP'd or blocked); notifies; never RSVPs anyone |
| `GET /api/activity` | `{ upcoming: EventSummary[], past: EventSummary[], invitations, connectionRequests (03), notifications (01) }` |
| `POST /api/events/:id/feedback` | After `completed`; `{ rating, metSomeone?, comment? }` |
| `POST /api/events/:id/reconnect` | `{ toUserId }`; both must have attended (confirmed RSVP) and event `completed`; on mutual interest → create `follow_up_suggestions` via 02's `follow_up_suggestion` prompt and notify both with `reconnect_suggestion` |
| `PATCH /api/events/:id/complete` | Business owner (05 auth) or `DEMO_MODE` operator: `published/full → completed`; this exists here because the follow-up flow owns completion side effects |
| `GET /api/businesses/nearby?radiusKm=` | `BusinessPublicCard[]` with distance and next event |

## 7. UI

### `/discover` (Screen 2 — Home)
Feed layout in the Meta-aligned system ([`../design-system.md`](../design-system.md)): 680px center column of white cards on the gray canvas, one lead "For you" event card at full width with 2:1 imagery and the explanation under a gradient `AiTag`; a horizontal rail of 3 suggested people (03 cards, compact, blue Connect buttons); a band of nearby businesses with their next event; recommended public groups; the agent's suggestion strip ("Your agent noticed…") with an `AiRing` avatar lives in the right rail at ≥1024px and at the bottom of the feed on mobile. Supporting cards are compact so the lead card carries the hierarchy; every AI-derived element carries the `AiTag`.

### `/events`, `/events/:id` (Screen 6)
- Feed: tabs For you · All · This week; cards show venue, date/time, price, capacity meter, friends-going avatars, explanation line
- Detail: hero, business card with address and link to nearby page, description, format, capacity meter ("7 of 10 spots"), price, **RSVP** button with a consent sheet on first RSVP ("Share my name with other attendees" / "Share my name with the venue", prefilled from permissions), attendee preview, "Invite a group" picker, and status-aware states: Full, Cancelled, Completed (shows feedback + "Who would you like to see again?")
- Reconfirm banner when `needsReconfirm`: "The venue updated this event (new time 6:30 PM). Still coming?" with Reconfirm / Cancel

### `/activity` (Screen 8)
Sections: Upcoming (with reconfirm badges), Invitations, Connection requests, Past events (feedback prompts), Follow-up suggestions ("Your agents suggest: Coffee at Ritual Grounds, Saturday morning" with Accept / Dismiss; shows "Waiting for Alex" until both accept), Notifications list.

### Nearby businesses (part of Discover, P1 standalone `/places`)

## 8. Seed Contribution

Extend `events.json` with RSVPs: each seeded event has 3–8 confirmed RSVPs with mixed `share_with_attendees`; one event is full. Add one `completed` event in the past at Ritual Grounds with 6 attendees including two seeded users who will be used in Scene 6 (`maya@` and `jordan@commonground.test`), and a reconnect row from one of them so the presenter only has to add the other.

## 9. Tests

| Layer | Cases |
|---|---|
| Unit | recommendation score golden cases; slot derivation from `starts_at` (timezone America/Los_Angeles); attendee visibility matrix (consent × connection × block); invite-group skips RSVP'd and blocked members |
| Integration | concurrent RSVPs (20 parallel against capacity 10 → exactly 10 confirmed, event `full`); cancel reopens; `ALREADY_RSVPED`; RSVP rejected on draft/cancelled/past events; attendee endpoint forbidden without RSVP; non-consenting names hidden; reconnect requires completion + attendance; mutual reconnect creates one suggestion and two notifications; reconfirm flow |
| E2E | Scene 5: demo user's Discover shows "Beginner Pottery & Coffee Night" as lead with explanation → RSVP with sharing on → Activity shows it → group page (03) lists it. Scene 6: complete the past event → maya adds reconnect to jordan → both see the follow-up suggestion |

## 10. Acceptance Criteria

1. After 05 publishes the pottery event, it appears in the demo user's recommendations within one page load with a grounded explanation.
2. Capacity is never exceeded under concurrent RSVPs; the event flips to `full` and back correctly.
3. Attendee identities are shown only with consent and never across a block.
4. Group event invitations never create RSVPs; each invitee confirms individually.
5. Mutual reconnect interest after a completed event produces an AI follow-up suggestion visible to both users and nobody else.

## 11. Independence Notes

- Stubs: `getBusinessPublicCard` reading `businesses` directly; `explainRecommendation` templated; `getGroupMemberIds` reading `group_members`; a local `events` fixture loader if 05's migration is not merged (test-only migration creating the `events` table per 05 §4 so both sides converge).
- `MOCK_AI` fixtures: none owned; relies on 02's `agent.explain_recommendation.json` and `agent.follow_up_suggestion.json`.

## 12. Risks

| Risk | Mitigation |
|---|---|
| Race conditions on capacity | `select … for update` inside a security-definer function; integration test with 20 parallel RSVPs |
| Leaking attendee identity | Consent snapshot stored on the RSVP row; single visibility function used by every attendee-facing DTO; matrix unit test |
| Timezone bugs in slot matching | All event times stored UTC, slot derived in `America/Los_Angeles` via `Intl`; golden tests around DST |
| Discover becomes a generic card grid | Layout spec above; design review before merge |
