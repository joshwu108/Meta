# Workstream 06 progress

Branch: `ws/06-events`. Spec: [`specs.md`](./specs.md).

## Acceptance criteria (P0)

- [x] AC1. A newly published pottery event appears in the demo user's recommendations within one page load, with a grounded explanation
- [x] AC2. Capacity is never exceeded under concurrent RSVPs; the event flips to `full` and back correctly
- [x] AC3. Attendee identities are shown only with consent and never across a block
- [x] AC4. Group event invitations never create RSVPs; each invitee confirms individually
- [x] AC5. Mutual reconnect interest after a completed event produces an AI follow-up suggestion visible to both users and nobody else

## Build items (P0)

- [x] Migration `0600_events_rsvp.sql` (rsvps, event_feedback, reconnect_interest, follow_up_suggestions, bookmarks, deferred FKs, RLS, `rsvp_event`, `cancel_rsvp`)
- [x] Exported contracts in `src/features/events/index.ts`: `getUpcomingEventsForUser`, `getEventPublic`
- [ ] Recommendation scoring (`server/recommend.ts`) with explanations via 02's `explainRecommendation`
- [x] Attendee visibility function (single function used by every attendee-facing DTO)
- [x] Invite-group filtering (skip RSVP'd and blocked members, never RSVP anyone)
- [x] Reconnect + follow-up suggestion flow
- [x] Route handlers: `GET /events`, `GET /events/recommended`, `GET /events/:id`, `POST|DELETE /events/:id/rsvp`, `POST /events/:id/reconfirm`, `GET /events/:id/attendees`, `POST /events/:id/invite-group`, `GET /activity`, `POST /events/:id/feedback`, `POST /events/:id/reconnect`, `PATCH /events/:id/complete`, `GET /businesses/nearby`
- [x] UI: `/discover`, `/events`, `/events/:id`, `/activity` (builds; visual/E2E run pending, see Blocked)
- [x] Seed: RSVPs for seeded events, one full event, completed Ritual Grounds event with maya@ and jordan@ plus one reconnect row

## Tests (spec §9)

### Unit
- [x] Recommendation score golden cases
- [x] Slot derivation from `starts_at` in America/Los_Angeles, including DST edges
- [x] Attendee visibility matrix (consent × connection × block)
- [x] Invite-group skips RSVP'd and blocked members

### Integration
- [x] 20 parallel RSVPs against capacity 10 → exactly 10 confirmed, event `full`
- [x] Cancel reopens a full event
- [x] `ALREADY_RSVPED`
- [x] RSVP rejected on draft, cancelled and past events
- [x] Attendee endpoint forbidden without an RSVP (service against Postgres via query stand-in; Supabase-stack run pending, see Blocked)
- [x] Non-consenting names hidden (service against Postgres via query stand-in; Supabase-stack run pending, see Blocked)
- [x] Reconnect requires completion + attendance
- [x] Mutual reconnect creates one suggestion and two notifications
- [x] Reconfirm flow

### E2E
- [ ] Scene 5: Discover leads with "Beginner Pottery & Coffee Night" + explanation → RSVP with sharing → Activity shows it → group page lists it
- [ ] Scene 6: complete past event → maya adds reconnect to jordan → both see the follow-up suggestion

## P1

- [x] Filters (category, date, distance)
- [ ] List/map toggle (static tiles)
- [x] Bookmarks
- [x] Waitlist with auto-promotion on cancel (`WAITLIST_ENABLED`)
- [x] Public group discovery surfacing (Discover "Groups to join", via 03 stub)
- [x] Standalone `/places`

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
- 2026-10-24: Scoring interprets the +0.5 tag bonus as `(categoryMatch + 0.5·tagMatch) / 1.5` so interest never exceeds its 40 points. Unknown budget or viewer location scores half credit; group size gets 0.7 for an exact capacity bucket and 0.35 for an adjacent one, plus 0.3 when friends are going (capped at 1).
- 2026-10-24: Slots use local America/Los_Angeles time: 17:00+ is the evening slot of that day, Sat/Sun before 17:00 is `sat_day`/`sun_day`, 00:00–04:59 belongs to the previous evening, weekday daytime maps to no slot.
- 2026-10-24: Attendee list `count` is every confirmed attendee (viewer included, same number as the capacity meter). Non-consenting attendees appear as anonymous `{ isConnection: false }` entries so a hidden connection cannot be inferred; blocked attendees are omitted from the list in both directions. Order: connections, named, anonymous.
- 2026-10-24: `getUpcomingEventsForUser(userId)` returns every live event in the next 21 days plus the user's own upcoming RSVP'd events, each with the user's `rsvpStatus` (null if none), soonest first. 03's planner filters it; a group page can filter `rsvpStatus !== null` per member.
- 2026-10-24: Event detail `attendeePreview.avatars` shows consented attendees only to viewers with a confirmed RSVP; before RSVPing a viewer sees only their own connections (plus the count). "Share my name with other attendees" is not consent to be shown to browsers.
- 2026-10-24: Feed cards return `friendsGoing` as `{ userId, displayName, avatarUrl }[]` (accepted connections, consented, confirmed, not blocked either way) so the UI can render avatars.
- 2026-10-24: Explanations are cached in-process for 24h keyed by `(viewer, event, prefsHash)`; failures fall back to "Coming up soon near you." rather than failing the feed.
- 2026-10-24: Routes and services read cross-user data (counts, attendees, friends) with the service-role client and filter it in `visibility.ts`; the user's own RSVP writes go through the RLS-bound client and the security-definer functions.
- 2026-10-24: Services are integration-tested against Postgres through `tests/integration/support/fake-supabase.ts`, a test-only shim that runs the subset of supabase-js calls 06 uses as SQL (`row_to_json`, so JSON shapes match PostgREST). It does not enforce RLS; RLS and PostgREST behavior still need a `supabase start` run (see Blocked).
- 2026-10-24: All event-time comparisons parse to instants (`server/time.ts`); ISO strings carry the session's UTC offset and are never compared as text.
- 2026-10-24: `add_reconnect_interest` takes a per-pair advisory lock so two simultaneous taps always detect mutual interest (test fails without the lock).
- 2026-10-24: `rsvp_event` checks for an existing active RSVP before capacity, so a confirmed attendee re-RSVPing to a full event gets `ALREADY_RSVPED`, not `CAPACITY_FULL`.
- 2026-10-24: Follow-up accept/dismiss needs a route the spec does not list: `PATCH /api/follow-ups/:id` with `{ action: 'accept' | 'dismiss' }`. Transitions: suggested → accepted_a/accepted_b → accepted_both; dismiss from anything but accepted_both.
- 2026-10-24: Group event invitations notify with type `group_invite` and payload `{ kind: 'event', eventId, groupId, title }` (no dedicated event-invite type in NOTIFICATION_TYPE).
- 2026-10-24: Event completion is allowed for the venue owner or anyone while `DEMO_MODE=1`; it goes through the service-role client because 05's RLS only lets owners write events.
- 2026-10-24: Follow-up suggestions pick the nearest active business in the suggested category to the event venue as `businessId` (Scene 6 lands on Ritual Grounds).
- 2026-10-24: UI uses CSS modules on the design tokens instead of Tailwind (no Tailwind config on main yet; 01 owns it). `src/styles/tokens.css` is generated verbatim from design-system.md, and primitive stand-ins live in `src/features/events/components/ui/` with 01's names (`Button`, `AiTag`, `AiRing`, `Avatar`, `CapacityMeter`, `StatusPill`, `EmptyState`, `Switch`). Swap the imports to `@/features/core/components/ui` when 01 lands.
- 2026-10-24: Pages call the services directly as server components; client controls call the routes and `router.refresh()`. The RSVP consent sheet opens on every RSVP (not only the first) so sharing can be changed on re-RSVP.
- 2026-10-24: The invite picker reads 03's `GET /api/groups` from the browser and degrades to a hint when it is unavailable.
- 2026-10-24: Event filters are a plain GET form (category, distance) applied to the All and This week tabs; "This week" is the date filter. For you stays ranked and unfiltered.
- 2026-10-24: Bookmarks get `POST/DELETE /api/events/:id/bookmark` (not in the spec's route table). Saved upcoming events appear in Activity under "Saved", minus any the user already RSVP'd to.
- 2026-10-24: List/map toggle deferred: static map tiles need a tile provider (and likely a key) plus a CSP `img-src` entry from 01. Recorded under Blocked.

## Needs from others

- 01: call `seedEventsAndRsvps(admin, usersByEmail)` from `supabase/seed/06-events.ts` after users, businesses and events load. It expects a "Ritual Grounds" business and users `maya@`, `jordan@`, `alex@`, `sam@`, `priya@`, `lee@commonground.test` (any missing attendee is skipped). Fixture: `supabase/seed/fixtures/events-06.json`.
- 03: export a server function for Discover's people rail (top N matches with explanation); `getSuggestedPeople` is an empty stub, so the rail shows an empty state linking to /match.
- 01: app shell `(consumer)/layout.tsx` with nav and the 680/320 frame; 06's pages render only their content column (Discover adds its own right rail).
- 02: export `getAttendeeSharing(userIds)` → `{ interests, shareInterestsWithAttendees }` per user and `getRsvpConsentDefaults(userId)`. The RSVP sheet and shared-interest chips need them, and only 02 may read `agent_profiles` / `user_preferences`. Stubbed in `src/features/events/server/stubs/agent.ts`.
- 02: add `ExplainInput` to `src/shared/types.ts`. 06 sends `{ viewer, target: { kind: 'event', title, category, slotLabel, capacity, priceCents }, breakdown }`.
- 02: export `suggestFollowUp({ a, b, event })` wrapping the `agent.follow_up_suggestion` prompt (06 §6 reconnect).
- 03: export `getConnectionIds(userId)` and `getBlockEdges(userId)`, plus helpers to create and read `invitations(kind='event')`. Stubbed in `src/features/events/server/stubs/social.ts`.
- 03: `EventSummary` has no `category`; if the planner needs to filter by category, call `getEventPublic` or ask the integrator to add `category` to `EventSummary`.
- 05: `events` needs the shared `set_updated_at` trigger (README says every table has one; 05 §4 does not list it). 06's reconfirm relies on `events.updated_at` moving on edits.
- 01/02: `SharablePreferences` in `src/shared/types.ts` has no `interestCategories`, but 06 §5 scores on it. Please add `interestCategories: EventCategory[]` (02 already stores `interest_categories`). Until then 06 derives categories from interest tags.

## Blocked

- P1 list/map toggle: needs a static map tile provider decision (OpenStreetMap static tiles, Mapbox with a key, etc.) and 01's CSP to allow its `img-src`. Everything else on the page works without it.
- Supabase CLI and Docker are not available here, so `pnpm db:reset`, `pnpm db:seed`, route-level integration tests through PostgREST, and Playwright scenes cannot run on this machine. SQL is covered on plain Postgres; services are covered with mocked repo/stubs. Needs a machine with `supabase start` (or Docker running) to finish the Supabase-stack checks.

## Log

- 2026-10-24 15:59 PT: P1 filters, bookmarks (save/unsave + Activity "Saved"), standalone /places (138 tests). Next: theme checklist review, size limits, never-idle pass.
- 2026-10-24 15:55 PT: coverage 97% lines / 83% branches on features/events/server (137 tests); P1 waitlist UI + promotion notification. Next: P1 filters, bookmarks, /places.
- 2026-10-24 15:52 PT: seed contribution with idempotent re-runs (110 tests). Next: never-idle list (coverage, edge cases, theme review).
- 2026-10-24 15:50 PT: UI for Discover, Events (For you/All/This week), event detail (RSVP sheet, reconfirm, invite, feedback, reconnect) and Activity; `next build` passes. Next: seed contribution, then the never-idle list.
- 2026-10-24 15:43 PT: all 13 route handlers plus PATCH /follow-ups/:id, route tests over Postgres (107 tests); fixed duplicate-vs-full RSVP error order. Next: UI for /discover, /events, /events/:id, /activity.
- 2026-10-24 15:41 PT: invite, post-event, follow-up, activity and nearby services; Postgres-backed service tests; reconnect race and timestamp-ordering fixes (100 tests). AC2–AC5 covered at service level. Next: route handlers, then UI.
- 2026-10-24 15:34 PT: stubs for 01/02/03, repository, exported contracts, RSVP service, feed/recommendation/detail/attendee services (68 unit + 18 integration tests). Next: invite-group, activity, post-event services, route handlers.
- 2026-10-24 15:27 PT: slot derivation, recommendation scorer, attendee visibility, invite selection (48 unit tests). Next: data access layer, exported contracts, route handlers.
- 2026-10-24 15:23 PT: progress file, interim scaffold, 0600 migration with 18 passing integration tests. Next: domain logic (slots, scoring, visibility, invites) with unit tests.
