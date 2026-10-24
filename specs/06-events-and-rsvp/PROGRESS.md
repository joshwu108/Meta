# Workstream 06 progress

Branch: `ws/06-events`. Spec: [`specs.md`](./specs.md).

## Acceptance criteria (P0)

- [ ] AC1. A newly published pottery event appears in the demo user's recommendations within one page load, with a grounded explanation
- [ ] AC2. Capacity is never exceeded under concurrent RSVPs; the event flips to `full` and back correctly
- [ ] AC3. Attendee identities are shown only with consent and never across a block
- [ ] AC4. Group event invitations never create RSVPs; each invitee confirms individually
- [ ] AC5. Mutual reconnect interest after a completed event produces an AI follow-up suggestion visible to both users and nobody else

## Build items (P0)

- [ ] Migration `0600_events_rsvp.sql` (rsvps, event_feedback, reconnect_interest, follow_up_suggestions, bookmarks, deferred FKs, RLS, `rsvp_event`, `cancel_rsvp`)
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
- [ ] 20 parallel RSVPs against capacity 10 → exactly 10 confirmed, event `full`
- [ ] Cancel reopens a full event
- [ ] `ALREADY_RSVPED`
- [ ] RSVP rejected on draft, cancelled and past events
- [ ] Attendee endpoint forbidden without an RSVP
- [ ] Non-consenting names hidden
- [ ] Reconnect requires completion + attendance
- [ ] Mutual reconnect creates one suggestion and two notifications
- [ ] Reconfirm flow

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

## Needs from others

## Blocked

## Log
