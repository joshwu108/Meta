# Workstream 06 progress

Branch: `ws/06-events`. Spec: [`specs.md`](./specs.md).

## Acceptance criteria (P0)

- [ ] AC1. A newly published pottery event appears in the demo user's recommendations within one page load, with a grounded explanation
- [ ] AC2. Capacity is never exceeded under concurrent RSVPs; the event flips to `full` and back correctly
- [ ] AC3. Attendee identities are shown only with consent and never across a block
- [ ] AC4. Group event invitations never create RSVPs; each invitee confirms individually
- [ ] AC5. Mutual reconnect interest after a completed event produces an AI follow-up suggestion visible to both users and nobody else

## Build items (P0)

- [x] Migration `0600_events_rsvp.sql` (rsvps, event_feedback, reconnect_interest, follow_up_suggestions, bookmarks, deferred FKs, RLS, `rsvp_event`, `cancel_rsvp`)
- [ ] Exported contracts in `src/features/events/index.ts`: `getUpcomingEventsForUser`, `getEventPublic`
- [ ] Recommendation scoring (`server/recommend.ts`) with explanations via 02's `explainRecommendation`
- [ ] Attendee visibility function (single function used by every attendee-facing DTO)
- [ ] Invite-group filtering (skip RSVP'd and blocked members, never RSVP anyone)
- [ ] Reconnect + follow-up suggestion flow
- [ ] Route handlers: `GET /events`, `GET /events/recommended`, `GET /events/:id`, `POST|DELETE /events/:id/rsvp`, `POST /events/:id/reconfirm`, `GET /events/:id/attendees`, `POST /events/:id/invite-group`, `GET /activity`, `POST /events/:id/feedback`, `POST /events/:id/reconnect`, `PATCH /events/:id/complete`, `GET /businesses/nearby`
- [ ] UI: `/discover`, `/events`, `/events/:id`, `/activity`
- [ ] Seed: RSVPs for seeded events, one full event, completed Ritual Grounds event with maya@ and jordan@ plus one reconnect row

## Tests (spec §9)

### Unit
- [ ] Recommendation score golden cases
- [ ] Slot derivation from `starts_at` in America/Los_Angeles, including DST edges
- [ ] Attendee visibility matrix (consent × connection × block)
- [ ] Invite-group skips RSVP'd and blocked members

### Integration
- [x] 20 parallel RSVPs against capacity 10 → exactly 10 confirmed, event `full`
- [x] Cancel reopens a full event
- [x] `ALREADY_RSVPED`
- [x] RSVP rejected on draft, cancelled and past events
- [ ] Attendee endpoint forbidden without an RSVP
- [ ] Non-consenting names hidden
- [x] Reconnect requires completion + attendance
- [ ] Mutual reconnect creates one suggestion and two notifications
- [x] Reconfirm flow

### E2E
- [ ] Scene 5: Discover leads with "Beginner Pottery & Coffee Night" + explanation → RSVP with sharing → Activity shows it → group page lists it
- [ ] Scene 6: complete past event → maya adds reconnect to jordan → both see the follow-up suggestion

## P1

- [ ] Filters (category, date, distance)
- [ ] List/map toggle (static tiles)
- [ ] Bookmarks
- [ ] Waitlist with auto-promotion on cancel (`WAITLIST_ENABLED`)
- [ ] Public group discovery surfacing
- [ ] Standalone `/places`

## Decisions

- 2026-10-24: No scaffold on main yet (01 has not landed). Added a minimal interim scaffold (package.json, tsconfig, eslint, vitest, next config) and copied `src/shared/enums.ts` / `types.ts` verbatim from the README and 01 spec. 01's versions win on merge.
- 2026-10-24: Supabase CLI and Docker are not available on this machine, so integration tests run on plain local Postgres (`TEST_DATABASE_URL`, default `postgres://localhost:5432/postgres`). Each test file creates and drops its own `cg06_test_*` database, loads `tests/integration/support/upstream.sql` (01/02/03/05 tables copied from their specs plus an `auth.uid()` shim), then applies every `06xx` migration. Suites skip when no Postgres is reachable.
- 2026-10-24: `rsvp_event` takes `p_allow_waitlist boolean default false` and raises `CAPACITY_FULL` inside the row lock, instead of the route checking capacity first (that check would race). P1 waitlist passes `true`.
- 2026-10-24: Re-RSVP after cancel also refreshes the sharing snapshot (the spec's upsert kept the old consent).
- 2026-10-24: `cancel_rsvp` returns `(cancelled, promoted_user_id, event_status)` and already promotes the oldest waitlisted RSVP, so the P1 waitlist needs no schema change.
- 2026-10-24: `needs_reconfirm` is set by a trigger on `events` when `starts_at`, `ends_at` or `price_cents` change on a published/full event, so 05 does not need to call into 06. Capacity changes do not ask attendees to reconfirm.
- 2026-10-24: Added `reconfirm_rsvp(event)` and `add_reconnect_interest(event, to_user)` security-definer functions; RLS gives users select-only on `rsvps`, and the completion + attendance checks belong next to the data.
- 2026-10-24: `follow_up_suggestions` stores pairs in canonical order (`check (user_a < user_b)`) so the unique key cannot be duplicated as (b, a).
- 2026-10-24: Bookmarks get RLS + a self policy (spec omitted it; 01's CI guard requires RLS on every table).
- 2026-10-24: Deferred FKs to 03's `groups` / `invitations` are guarded with `to_regclass` so 0600 applies even if 03 has not merged; on a fresh reset 0300 runs first and the FKs are created.

## Needs from others

- 05: `events` needs the shared `set_updated_at` trigger (README says every table has one; 05 §4 does not list it). 06's reconfirm relies on `events.updated_at` moving on edits.
- 01/02: `SharablePreferences` in `src/shared/types.ts` has no `interestCategories`, but 06 §5 scores on it. Please add `interestCategories: EventCategory[]` (02 already stores `interest_categories`). Until then 06 derives categories from interest tags.

## Blocked

## Log

- 2026-10-24 15:23 PT: progress file, interim scaffold, 0600 migration with 18 passing integration tests. Next: domain logic (slots, scoring, visibility, invites) with unit tests.
