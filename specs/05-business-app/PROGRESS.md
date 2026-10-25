# Workstream 05 — Business Application · PROGRESS

Branch: `ws/05-business` · Spec: [`specs.md`](./specs.md) · Contracts: [`../README.md`](../README.md)

## Status: three fixes still to pull into main

All six workstreams are merged into `main`, and the whole product is green there:
**800 unit, 213 integration, 62 db and 59 e2e tests pass with nothing skipped**, plus
typecheck, lint and build (verified 2026-10-25 01:30 on a fresh `db reset` + `db:seed`).

**Three 05 bug fixes are still only on `ws/05-business`.** They landed after the branch was
merged, so the integrator needs to merge it once more:

- `e3f960e` + `cf29fb6` — **every time on the business screens is the venue's wall clock.**
  The editor read and wrote `datetime-local` in the browser's zone, and the display
  formatters rendered in whoever was rendering, while opening hours, a proposal's suggested
  slot and its assumptions text are all venue time. The proposal header read "8:30 PM"
  directly above an assumption reading "Staff available Thursday 18:30-20:15". Both halves
  are fixed and the e2e specs now pin the browser to **UTC**, so they prove the app is
  independent of the viewer's zone rather than hiding the dependency.
- `bd003d3` — 05 passed a **business id** where `agent_action_log.user_id` references
  `profiles(id)`, so every publish and proposal decision silently failed its audit insert
  (01's helper logs and returns rather than throwing). A publish now records the venue's
  owner.

Every P0 and P1 item below is ticked.

Merge order note: 05's `0500_business.sql` adds **both** cross-workstream foreign keys
(`proposals_business_fk`, `events_proposal_fk`) behind an `if exists` guard, so it is safe
either side of 04. Both were confirmed present in the 13-migration run.

---

## Acceptance Criteria (spec §10)

- [x] **A1** A business can complete onboarding and appears in 06's nearby businesses.
- [x] **A2** The pottery proposal appears in the inbox with banded demand and a clear "estimate" label; approve, edit & approve, and reject all work and are atomic.
- [x] **A3** No route in this workstream returns user ids, raw cohort counts, or non-consented names.
- [x] **A4** Publishing an approved proposal makes the event visible to consumers (06) and notifies the originating cohort.
- [x] **A5** Editing a published event notifies attendees and cannot shrink below confirmed RSVPs.

## P0 Scope (spec §3)

### Foundation
- [x] **F1** Runnable workspace: package.json, tsconfig, Tailwind, Vitest, Playwright
- [x] **F2** `supabase/migrations/0500_business.sql` — businesses, business_capabilities, events, RLS, status-guard trigger
- [x] **F3** Shared contracts consumed: `src/shared/enums.ts`, `src/shared/types.ts` (05's types), `src/lib/api/envelope.ts`
- [x] **F4** `src/features/business/server/stubs.ts` for 01 (`notify`, `logAgentAction`) and 04 (`event_proposals` fixtures)
- [x] **F5** Zod schemas: `BusinessOnboarding`, `EventEdits`, `EventInput`, `ProposalDecision`

### Domain logic (spec §5)
- [x] **D1** Event status machine — legal transitions only, every illegal transition rejected
- [x] **D2** `validateEventAgainstCapabilities` — capacity ≤ business capacity, start within hours
- [x] **D3** `decideProposal` (approve / modify / reject) via atomic `decide_proposal` RPC
- [x] **D4** `publishEvent` — `approved_draft → published`, cohort fan-out notify, action log
- [x] **D5** `updateEvent` — notify confirmed RSVPs, reject capacity decrease below confirmed
- [x] **D6** `cancelEvent` — requires reason, notifies confirmed RSVPs
- [x] **D7** `findCandidateBusinesses(criteria)` — prefilter + haversine + top 5 with reasons
- [x] **D8** `getBusinessPublicCard(id)` — no owner id, no capability notes
- [x] **D9** Demand banding — no raw cohort count ever leaves a DTO

### API (spec §6)
- [x] **R1** `POST /api/business` (withAuth) + static neighborhood geocode
- [x] **R2** `GET/PATCH /api/business/me`
- [x] **R3** `GET /api/business/proposals` (banded)
- [x] **R4** `GET /api/business/proposals/:id`
- [x] **R5** `PATCH /api/business/proposals/:id`
- [x] **R6** `POST /api/business/events`
- [x] **R7** `PATCH /api/business/events/:id`
- [x] **R8** `POST /api/business/events/:id/publish`
- [x] **R9** `POST /api/business/events/:id/cancel`
- [x] **R10** `GET /api/business/events` with `confirmedCount` (guarded for missing `rsvps`)
- [x] **R11** `GET /api/business/events/:id/attendees` with name masking
- [x] **R12** `POST /api/dev/proposals` (dev-only fixture insert, spec §11)

### UI (spec §7)
- [x] **U1** `/business/onboarding` — 4 steps (Profile, Location & hours, What you can host, Review)
- [x] **U2** `/business` dashboard — stat row, AI proposals waiting, upcoming events, quick-create
- [x] **U3** `/business/proposals` inbox + nav badge with pending count
- [x] **U4** `/business/proposals/:id` — proposal card, why/assumptions, decision panel, status timeline
- [x] **U5** `/business/events/new` + `/business/events/:id/edit` editor
- [x] **U6** `/business/events` table (status pills, RSVP counts, edit / publish / cancel
  per row) + `/business/events/:id/attendees`
- [x] **U7** Theme conformance: tokens, light+dark, `AiTag` on every AI artifact, `StatusPill` colors

### Seed (spec §8)
- [x] **S1** `businesses.json` + capabilities: Kiln & Cup, Ritual Grounds, Meeple House
- [x] **S2** `proposals.json` — one pending proposal for Ritual Grounds

## Tests (spec §9)

### Unit
- [x] **T-U1** status machine: every illegal transition rejected
- [x] **T-U2** edits validation against capabilities
- [x] **T-U3** capacity decrease below confirmed rejected
- [x] **T-U4** attendee name masking
- [x] **T-U5** `findCandidateBusinesses` prefilter and ordering
- [x] **T-U6** demand band never a raw number in any DTO (property test over DTO builders)

### Integration
- [x] **T-I1** owner-only access to proposals and events (other owner → `NOT_FOUND`)
  — **verified against a live stack**; it caught a real security bug (see Decisions)
- [x] **T-I2** `decide_proposal` RPC is atomic (failure after proposal update → rollback)
- [x] **T-I3** approve creates `approved_draft` event linked to proposal
- [~] **T-I4** publish notifies cluster members without exposing ids — written; the
  cohort half needs 04's `demand_cluster_members`, so it skips until 04 merges
- [~] **T-I5** cancel notifies RSVPs — rewritten against 06's real table; skips until 06 merges `rsvps`
- [x] **T-I6** public can read only published/full/completed events
- [x] **T-I7** `proposals_business_fk` exists after a full reset (spec §12)

### E2E
- [x] **T-E1** Scene 4: Kiln & Cup owner → dashboard → pending pottery proposal → edit &
  approve ($20→$25, 18:30) → publish → list shows Published — **passes end to end** against
  04's real migrations (verified locally, see Decisions); skips on `main` until 04 merges
- [x] **T-E2** Manual event lifecycle in a browser: create draft → edit → publish →
  attendees → cancel, plus the two refusals and another venue's event being unreachable
- [x] **T-E3** Theme matrix: both themes at 320 / 768 / 1024 / 1440, no horizontal scroll
- [x] **T-E4** Publish and cancel straight from the events table, and the actions a given
  status does *not* offer

## P1 (spec §3)
- [x] **P1-1** `/business/insights` — banded demand by category × slot within 3 km, last 30 days
- [x] **P1-2** Analytics: past events, attendance, repeat attendees (count only)
- [x] **P1-3** "Ask AI to revise" on a proposal — 04 built the endpoint I asked for;
  verified end to end against their branch (see Decisions)

---

## Decisions

- **2026-10-24 — Verified the attendee path against workstream 06's branch.** 06's `rsvps`
  carries exactly the columns 05 reads, and its policy is `auth.uid() = user_id` — so a
  venue reading its own attendee list *as itself* gets nothing. That confirms the earlier
  service-role fix was necessary, not tidying: without it `confirmedCount` and every
  attendee list would have been empty once 06 merged.
  06 also handles 05's status guard properly: `sync_event_capacity_status()` derives
  `published` ⇄ `full` from the confirmed count and sets `commonground.status_rpc` itself,
  rather than calling `transition_event_status()`, because that function trusts only the
  venue owner or the service role and an RSVP comes from an attendee. The outcome is
  derived rather than chosen by the caller, and the function is revoked from `public`, so
  the guard's intent holds.
  While doing this I found **T-I5 could never have run**: it depended on 06's table but sat
  inside the proposal suite, which skips wholesale on 04's table, and it only asserted the
  RPC half, ending on a no-op expectation. Rewritten in the suite that is not gated on 04.

- **2026-10-24 — P1-3 built and verified against 04's branch.** 04 had already shipped the
  revise endpoint I asked for, so rather than stub it I grafted their branch locally
  (migrations plus `src/features/demand` and `src/app/api/ai`, never committed). Two things
  came out of it: **their feature typechecks against 05 with zero errors**, and the flow
  works end to end — asking for a revision leaves the original `expired` at revision 0 and
  opens a new `pending` proposal at revision 1 carrying the owner's note, exactly the
  supersede behaviour `0403` documents. Notable contract details 05 had to honour: the
  request schema is `.strict()` and needs at least one field, so an untouched control is
  omitted rather than sent empty; and because the answer is a *new* proposal, the panel
  navigates to it instead of refreshing an expired page.

- **2026-10-24 — Verified against workstream 04's real branch, and it found two bugs.**
  04's branch carries its migrations, so rather than keep guessing from their spec I applied
  `0400`/`0402`/`0403`/`0404` locally (never committed), reset, seeded and ran everything.
  All seven migrations apply together and **both cross-workstream foreign keys appear**, so
  the `if exists` block in `0500` does its job. The 9 integration cases and 3 Scene 4 cases
  that had been skipping all ran, and two real bugs fell out:
  1. **`decide_proposal` read camelCase keys while the store sends an `events` row.** Every
     approval inserted `starts_at = null` and 500'd — Scene 4 would have failed in the demo.
     Neither suite could catch it: the in-memory store consumes the object directly without
     touching SQL key names, and the integration tests hand-wrote the RPC payload in
     camelCase, so both sides were self-consistently wrong. The seam only exists in the
     real stack. The tests now send exactly what the store sends.
  2. **The dev fixture route inserted as the owner**, which 04's RLS refuses with `42501` —
     correctly, since a venue must never be able to fabricate demand for itself. It stands
     in for 04's pipeline, so it runs as the service role now. Its error also blamed "04 has
     not merged" for any failure, and the e2e skip check matched any mention of the table,
     so a genuine error read as a skip. Only a missing relation means that now.
  Both are committed; 04's migrations were removed again afterwards.

- **2026-10-24 — Merged workstream 01 (37 conflicts).** Main wins on every file 05 stubbed:
  scaffold, `src/shared/enums.ts` and `types.ts`, `src/lib/api/*`, `src/lib/supabase/*`, the
  UI primitives, `tokens.css`, the seed runner and all the configs. 05 kept its screens,
  domain layer, migrations and tests, and moved onto the real contracts:
  - **Routes** use 01's `withAuth` / `withBusinessOwner`, which return the handler directly
    (no `route()` wrapper) and pass resolved `params`; dynamic ids are validated with
    `uuidSchema` the way 01's own routes do.
  - **`stubs.ts` is gone.** 01's `notify()` and `logAgentAction()` are real now. Their log
    takes an `actor`, and the enum has no `business_owner`, so 05's actions are logged as
    `planning_agent` — which is what spec §5 names for the publish path anyway.
  - **`BusinessShell` is gone** in favour of 01's `AppShell`, which was rendering a second
    `<main>` inside mine. `AppShell` reserves a `proposalsBadge` "supplied by workstream
    05"; the `(business)` layout now supplies it from `countPendingProposals`.
  - **The dev-only sign-in route is gone.** `/login` exists, so the e2e suite signs in
    through the real page with 01's `login()` helper and calls their `reseed()` between
    specs — which also retires the note about leftover events before a demo.
  - **Seed**: 01's runner and `loaders/` stay; `businesses.json` keeps their base fields and
    gains optional `hours` and `capabilities`, and `loaders/domain.ts` uses them when
    present. 05's `business-seed.ts` was deleted.
  - **Form controls**: 05 uses 01's `Input` (it carries its own label, hint and error, so
    05's `Field` wrapper went away); the textarea, select and link-button 01 does not ship
    live in `features/business/components/form.tsx`.
  - `EventDraft` and the money helpers moved out of `EventFieldset.tsx` into a plain
    `event-draft.ts`, because the Scene 4 payload test runs in Node and must not pull a
    component — and with it the whole UI barrel's JSX — into its graph.

- **2026-10-24 — Built the workspace scaffold locally.** `main` carries only `specs/` and
  `.claude/`; workstream 01's Next.js scaffold has not landed, and nothing (not even
  `vitest`) can run without one. Added the minimum needed to build and test: `package.json`,
  `tsconfig.json`, Tailwind/PostCSS config, `vitest.config.ts`, `next.config.ts`. These are
  01-owned files, so **main wins** on the next sync that brings 01's versions; my merge
  resolution keeps 01's file and re-adds only dependencies 05 needs.
- **2026-10-24 — Repository port in front of Supabase.** Every use case talks to
  `BusinessStore` (`server/store.ts`), implemented by `store-supabase.ts` in production and
  by `tests/support/memory-store.ts` in unit tests. The in-memory store reproduces the
  status machine, the atomicity of `decide_proposal` and the one-business-per-owner index,
  so the domain rules are tested without a database and RLS is left to the integration
  tests. This is what lifted `features/business/server` coverage past the 80% bar.
- **2026-10-24 — The status machine is enforced by a trigger plus RPCs.**
  `events_status_guard` rejects any `UPDATE` that changes `events.status` unless the caller
  set `commonground.status_rpc`, which only the SECURITY DEFINER functions in
  `0501_business_rpc.sql` do. `transition_event_status(event, status)` is exported for
  workstream 06's `full` / `completed` transitions — **this is the only way 06 should move
  an event's status**, and it is listed under Needs from others.
- **2026-10-24 — RPC errors carry an envelope code.** The RPCs raise
  `'<ERROR_CODE>: message'` and `store-supabase.ts` maps the prefix back to the API
  envelope, so a Postgres message never reaches a client and a conflict is a `CONFLICT`
  rather than a 500.
- **2026-10-24 — Venue wall-clock times resolve through `Intl`, not a date library.** A
  proposal carries a slot plus a local time, never an instant, so
  `nextSlotOccurrence()` resolves the next matching occurrence in `VENUE_TIMEZONE`
  (default `America/Los_Angeles`, the demo city), DST included.
- **2026-10-24 — T-I2 ("atomic decide") is asserted in the direction that can occur.** The
  spec suggests simulating a failure after the proposal update; in the shipped function the
  event insert comes first, so the test makes that insert violate a check constraint and
  asserts the proposal is still `pending` with no event. A second test asserts a repeat
  decision is a `CONFLICT` leaving exactly one event. Same guarantee, reachable from a test.
- **2026-10-24 — `/business/insights` (P1-1) shipped early** because it is pure banding over
  `demand_clusters` and shares the DTO builders already written for the inbox. It shows an
  empty state until 04 merges.
- **2026-10-24 — Post-mutation redirects are full navigations, not `router.push()`.**
  Every form looked broken in a production build: the request succeeded, the button stayed
  disabled and the page never moved. `router.push()` from inside a `startTransition` body
  does not settle when the page was reached by a client-side navigation, and a `push()` to
  a route already in the App Router cache — which it always is, because the owner clicked
  through from it — is deduped into a no-op, with the RSC payload fetched and thrown away
  while the URL stays put. `router.refresh()` beforehand does not help. `useSubmit()` now
  awaits outside any transition and redirects with `window.location.assign`, which costs
  one round trip and makes every server component re-read its data after a mutation, which
  is what you want after creating, publishing or cancelling an event anyway.
- **2026-10-24 — The E2E suite no longer waits on workstream 01.** It signed in through
  `/login`, so every case skipped and not one of the nine business screens had ever been
  rendered. `POST /api/dev/session` performs an ordinary email and password sign-in
  server-side and lets the SSR client write the cookies — the same shape of dev-only
  affordance as `POST /api/dev/proposals` in spec §11, 404 in production, and **not** an
  auth bypass, since wrong credentials are refused exactly as a login form would refuse
  them. `signIn()` prefers `/login` whenever that page exists, so this quietly stops being
  used the moment 01 merges.
- **2026-10-24 — Ran the stack and found two bugs no unit test could reach.** Worth
  recording because both were invisible to 247 green unit tests:
  1. **`is_trusted_server()` tested `current_user`.** It is called from SECURITY DEFINER
     functions, where `current_user` is the function's *owner* (`postgres`) for every
     caller — so `can_act_on_business()` returned true for any signed-in user and the
     ownership check in `decide_proposal`, `transition_event_status`, `publish_event` and
     `cancel_event` was bypassed entirely. One owner could have published or cancelled
     another venue's event. Fixed to `session_user`, which keeps the role that actually
     connected (`authenticator` under PostgREST, `postgres` for psql or the seed runner).
  2. **Every "another workstream has not merged yet" guard checked for `42P01`.** Reads go
     through PostgREST, which answers from its own schema cache and reports `PGRST205`, so
     no guard ever fired: the proposal inbox, attendee list and confirmed count would have
     thrown `INTERNAL` instead of returning empty.
  The migration was edited in place rather than superseded by an `0502`, because
  `0501_business_rpc.sql` has only ever existed on this branch and has not been merged to
  `main`.
- **2026-10-24 — P1 analytics live on `/business/insights`, not in its response.** Spec §6
  fixes the shape of `GET /api/business/insights` as banded demand, so the past-event
  analytics (`server/analytics.ts`) are rendered by the page's server component instead of
  being bolted onto that response. Repeat attendees are a **count only**: the ids are
  counted inside `countRepeatAttendees()` and discarded, never returned.
- **2026-10-24 — Split the two biggest client components.** `OnboardingWizard` went from
  370 lines to 117 by moving each step into `components/onboarding/` and the draft rules
  into a pure `draft.ts`; `DecisionPanel` dropped to 207 with its payload builders in
  `components/decision/decision.ts`. Both pure modules are now unit-tested against the same
  Zod schemas their routes parse, which is what the Scene 4 payload hangs on.
- **2026-10-24 — Stubbed 01- and 04-owned shared files.** `src/shared/enums.ts`,
  `src/shared/types.ts`, `src/lib/api/envelope.ts`, `src/lib/supabase/*` are transcribed
  verbatim from `specs/README.md` §2 and §4 so 05 compiles against the real contract. Each
  file carries an `OWNED BY WORKSTREAM 01` header; main wins on sync.

## Needs from others

- **Integrator — merge `ws/05-business` once more.** Three bug fixes landed after the branch
  was merged and are **not on `main`**: `e3f960e` and `cf29fb6` (every time on the business
  screens is the venue's wall clock, not the viewer's) and `bd003d3` (the agent audit log
  recorded a business id where a profile id belongs, so every row was silently rejected).
  Repeated here because the worker prompt points integrators at this section; the full
  explanation is in the status block at the top of this file.
  Verified 2026-10-25 02:55 with three zones in play at once — server `TZ=UTC`, browser
  `Asia/Tokyo`, venue `America/Los_Angeles`: the proposal header, its assumptions text and
  the editor field all read 18:30 venue time. Without these commits that same configuration
  shows 1:30 AM in the header, 10:30 in the editor and 18:30 in the assumption — three
  different times for one event, on the machine whoever presents happens to use.

- **01** — scaffold, `envelope.ts` with `withBusinessOwner`, `notify()`, `logAgentAction()`,
  `src/shared/types.ts`. 05 stubs all of them meanwhile; nothing is blocked. Two asks:
  - **`/login` and `/signup?as=business`.** The Scene 4 Playwright test signs in through
    `/login`; it self-skips until that page exists.
  - **`src/shared/types.ts` should absorb the 05-owned types** added below the marker in
    this branch's copy (`DemandBand`, `WeeklyHours`, `BusinessCapabilities`,
    `BusinessOwnerView`, `BusinessEvent`, `EventEdits`, `ProposalDocument`,
    `ProposalSummary`, `ProposalDetail`, `AttendeeList`, `BusinessInsights`).
- **03 (+ 06, integrator) — two of 03's tests fail the moment 06 merges. Fix verified, not
  applied.** 06's `0600` adds `invitations_event_fk foreign key (event_id) references
  events(id)`, and 03's `contracts.test.ts` and `planner-routes.test.ts` invite people to a
  hardcoded `EVENT_ID` that no row has, so `createEventInvitations` fails with "Could not
  create event invitations". Neither side is wrong: the FK is right and the fixture predates
  it. **I reproduced it (graft 06's migration onto main, reset, seed, `pnpm test:integration`)
  and confirmed a fix takes the suite to 135/135 with nothing skipped**, but did not commit
  it, because 03 is actively committing to those files and it would conflict.
  The verified change, in both files:
  1. `const EVENT_ID = '…'` becomes `let EVENT_ID = '…'`, and the first `beforeAll` replaces
     it with a real id when the table exists:
     `const existing = await admin.from('events').select('id').limit(1); if (existing.data?.[0]) EVENT_ID = existing.data[0].id;`
     (cast `admin` for the lookup — `database.types.ts` predates 05, see the next item.)
     The literal stays as the fallback so 03's branch alone is unaffected.
  2. One dependent change in `contracts.test.ts`: the "06 stand-ins degrade" case asserts
     `getEventPublic(EVENT_ID)` is null, which stops being true once `EVENT_ID` is a real
     event. It should use a deliberately absent id
     (`'00000000-0000-0000-0000-000000000000'`) instead.
- **01** — the seed occasionally fails the first row right after `supabase db reset` with
  "profile update for demo.new@… failed: Database client error. Retrying the connection."
  Re-running `pnpm db:seed` succeeds. A short wait or a retry around the first write would
  save the next person thinking they have a regression; it briefly looked like one here.
- **01 — the seed computes event times in the *seeder's* timezone. Fix verified, not
  applied.** `eventTimes()` in `supabase/seed/loaders/domain.ts` uses `setHours()`, which is
  the machine's zone, while `start_hour` in `events.json` is clearly meant as the venue's
  wall clock. Seeded from CDT, an `11:00` event lands at **09:00** venue time; from UTC it
  lands somewhere else again, so demo data is not reproducible across machines. Verified fix
  (resolve the instant in the venue's zone, which also makes it DST-correct):
  ```ts
  const today = wallTimeInZone(VENUE_TIMEZONE, new Date());
  const day = new Date(Date.UTC(today.year, today.month - 1, today.day + daysFromNow));
  const start = zonedWallTimeToUtc(VENUE_TIMEZONE, day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), startHour, 0);
  ```
  `VENUE_TIMEZONE`, `wallTimeInZone` and `zonedWallTimeToUtc` are exported from
  `@/features/business/venue-time` (pure, no `server-only`). Confirmed locally: the four
  seeded events move to their intended venue hours. Not committed — 01 was committing to
  that file a minute earlier.
- **01 / 06 — a seeded event lands on a day its venue is closed.** `days_from_now` is
  relative to the seed date, so the weekday drifts daily; today "Wheel Throwing Basics"
  seeds on a **Monday** at Kiln & Cup, which has no Monday hours. 05's validation then
  refuses to edit the system's own data: `PATCH /api/business/events/:id` answers
  `422 "these details do not fit the venue: the venue is closed on mon"`. The scripted demo
  path is unaffected (Scene 4 edits a proposal, and its `thu_eve` slot is open), but anyone
  clicking Edit → Save on a seeded event hits it. Fixture fix rather than a code one: target
  a weekday each venue is open, or snap `days_from_now` to one.
- **01** — `agent_action_log.user_id` references `profiles(id)`, so a failed insert is only
  visible in the server log (the helper logs and returns). 05 was silently dropping every
  audit row for weeks because of it. A one-line note in the helper's doc comment, or
  surfacing the count somewhere, would make the next workstream's mistake findable.
- **01 / integrator** — **regenerate `src/lib/supabase/database.types.ts` after 05 merges.**
  It was generated before 05 existed, so the typed client does not know `businesses`,
  `business_capabilities` or `events`. 05's store takes an untyped `SupabaseClient` and is
  unaffected, but anything using the generated types has to cast — 03's contract test now
  does, and 06 will hit the same thing reading `events`. `pnpm db:types` regenerates it.
- **06** — **move event status only through `transition_event_status(p_event_id, p_to)`**
  (migration `0501_business_rpc.sql`). A direct `UPDATE ... SET status` is rejected by the
  `events_status_guard` trigger. Legal transitions from 05's side: `published -> full`,
  `full -> published`, `published|full -> completed`.
  06 also needs **`rsvps.share_with_business`**, set from 02's `share_name_with_business`
  consent. 05 defaults a missing or null value to `false`, so an attendee is private unless
  06 says otherwise.
  **No RLS policy is needed on `rsvps` for the business side.** 05 reads `rsvps` and the
  `profiles(display_name)` join with the **service role** and masks before returning,
  because privacy invariant 1 forbids a business from reading `profiles` and 06's RLS will
  scope `rsvps` to each attendee. If 06 would rather expose a count to the owning business
  directly, say so and 05 will switch that one read back to the request client.
- **04** — `event_proposals` / `demand_clusters` migrations (`0400–0499`). 05 works from
  `tests/fixtures/proposals/*.json` and `POST /api/dev/proposals` per spec §11. Three asks:
  - **`findCandidateBusinesses(criteria)` is ready now**, exported from
    `src/features/business/index.ts`, with the weighting from 04 §5.6 in
    `CANDIDATE_WEIGHTS`. It returns at most 5 `BusinessMatch` rows.
  - **Store `suggestedStartsAt` inside the `proposal` JSON** (04 §5.8 says "store
    alongside"). 05 reads `proposal.suggestedStartsAt` and recomputes it from the slot when
    absent, so either way works, but storing it keeps the inbox and the demo consistent.
  - **`event_proposals.business_id` FK**: `0500_business.sql` adds both FKs guarded by an
    `if exists` block, so whichever migration lands second does it. 04 does not need to.
  - **A revise endpoint for P1-3.** 05 spec §3 lists "Ask AI to revise" on a proposal as a
    P1 item "calls 04's revise endpoint", but §4 of `specs/README.md` gives 04 only
    `POST /ai/generate-opportunities` and `GET /ai/opportunities/:runId`. The ask:
    `POST /api/ai/proposals/:id/revise` taking `{ note: string }` (what the owner wants
    changed) and either updating `event_proposals.proposal` in place or inserting a new
    pending proposal that supersedes it. 05 has the UI slot ready on the decision panel and
    will wire it in one commit once the route and its shape are agreed on the README.
- **06** — `rsvps` table. `confirmedCount` is a guarded query returning 0 until it lands.

## Blocked

- ~~Git identity not configured in this clone.~~ **Resolved 2026-10-24 15:58**: the owner
  of this clone confirmed the author email and asked for it to be set, so
  `set-identity.sh "Joshua Wu" "joshwu10806@gmail.com" "joshwu108" 5` ran once
  (repo-local `git config` only, never `--global`). `ws/05-business` exists and is pushed.
- ~~The `supabase` CLI is not installed and the integration tests have never run.~~
  **Resolved 2026-10-24 17:02**: the CLI is now a devDependency (`pnpm add -D supabase`,
  no global install) and Docker was already running here, so `supabase start`,
  `db reset`, `db:seed` and the integration suite all execute. Anyone with Docker can now
  run `npx supabase start && npx supabase db reset && pnpm db:seed && pnpm test`.
  **Both migrations apply cleanly on a fresh reset** and the suite caught two real bugs.
- ~~The Playwright suite cannot run until 01 ships `/login`.~~ **Resolved
  2026-10-24 17:28**: a dev-only `POST /api/dev/session` does an ordinary password sign-in
  server-side, so the suite no longer waits on 01. **24 of 30 cases pass**, including the
  whole manual event lifecycle and the theme matrix in both themes at four widths; the
  6 that skip are Scene 4, waiting on 04. `signIn()` still prefers `/login` and will use it
  automatically once it exists.
- **The nine proposal-decision integration cases skip** until 04 merges
  `event_proposals`; they now report as `skipped` rather than passing vacuously.

## Log

- `2026-10-24 15:20` — session start. Read README, spec, design-system. Wakeup cron
  `7,27,47 * * * *` created. Derived this checklist. Next: scaffold (F1) and the
  `0500_business.sql` migration (F2), which unblocks 04 and 06.
- `2026-10-25 05:05` — **audited my own suite for tests that pass without testing.** Three
  had already turned up that way, so I went looking deliberately: grepped for early returns
  inside tests, skips that never un-skip, and assertions that cannot fail. Found two of the
  last kind — `expect(error === null || error.code !== undefined).toBe(true)`, which is
  always true since a PostgrestError always carries a code. In the notifications test it was
  the **only** assertion, so that test asserted nothing. Both were hedges I wrote while the
  other workstreams were unmerged and the behaviour was unknown; it is knowable now, so they
  assert it: an owner's insert into `notifications` is refused with `42501` while the service
  role's succeeds — the property 05's publish and cancel fan-out depends on — and a
  cross-owner capability update is filtered to zero rows rather than erroring. The rest of
  the audit came back clean, and 213 integration tests now run with **zero skips**, so
  nothing is quietly sitting out.
- `2026-10-25 04:35` — **put every business screen in the theme matrix, and the matrix was
  lying.** The design-system checklist asks for both themes at four widths, but only three
  of 05's eight screens were in it — not the two-column proposal detail, the dense attendee
  table, the event editor or insights, which are exactly the ones likely to break at 320px.
  Adding them exposed a flaw in my own helper: "Review" is a client-side navigation, so
  reading `page.url()` after `waitForLoadState` captured the *list* again under the detail's
  filename and silently dropped the screen it claimed to cover — the run was green and the
  screenshots looked plausible. It now waits for the URL. All seven screens pass at 320,
  768, 1024 and 1440 in both themes, and I read the 320px dark proposal detail by eye:
  surfaces, the gradient `AiTag`, the wrapped timeline, the stacked decision panel and the
  header time still agreeing with the assumptions text. 805 unit, 213 integration, 61 e2e.
- `2026-10-25 04:00` — **rendered the onboarding wizard for the first time; it works, and
  looking at it found two problems.** Business Screen 1 was the only screen of 05 that no
  test and no rehearsal had ever rendered, because every spec signs in as an owner who
  already has a venue. Walked all four steps against a real signup: the venue it creates is
  correct — slug, geocoded neighborhood from the address, hours, capabilities, price range,
  AI toggle.
  Two issues. **Hosting slots and opening hours are entered independently**, so the wizard
  accepted a venue that hosts Thursday evenings while Thursday is closed. Nothing rejects
  that at the boundary, but it is a dead end: 04 matches proposals on the hosting slots and
  05 then refuses to approve them because the venue is shut, so the owner finds out only at
  the decision. The Review step now says so. And the page rendered as a bare `div` with **no
  `main` landmark and no wordmark**, unlike 01's auth pages, on what is a business's first
  screen.
  One self-inflicted lesson: the first version of the new e2e spec signed in as the seeded
  consumer and gave her a venue, which left her a business owner for every spec that ran
  afterwards and emptied Scene 4's inbox. It passed alone and failed in the full run. It now
  signs up a throwaway account through `/signup?as=business`, which is the real route in.
  **805 unit, 213 integration, 61 e2e** green from a clean database.
- `2026-10-25 03:25` — **opened the insights page with real data and found an incoherent
  stat.** It had never been viewed with 04's `demand_clusters` present. The banded demand
  renders correctly (Creative/Thursday evenings 6-9, Food & drink 4-5, Games 4-5, no raw
  count anywhere), but the analytics row read **"Events hosted 0 · People who came 0 · Came
  back again 5"** — impossible. `countRepeatAttendees` counted across every event the venue
  owns while the other two stats count only finished ones, so a venue whose *upcoming*
  events share attendees reported repeat visitors it had never hosted. The caller now passes
  the scope, which also drops a query since the finished events are already in hand. Third
  bug in a row found by looking at a screen with real data rather than by a failing test.
  800 unit, 213 integration, 59 e2e all green.
- `2026-10-25 02:55` — **closed a gap in my own verification, and moved the merge request
  where integrators actually look.** Every timezone check so far had the browser in a
  foreign zone but the *server* in the venue's — and the dashboard and proposal detail are
  server components, so `formatDateTime` runs server-side there. Re-ran with three zones at
  once (server `TZ=UTC`, browser `Asia/Tokyo`, venue `America/Los_Angeles`): header, the
  assumptions text and the editor field all read 18:30 venue time, and the field hint says
  "Venue time (PDT)". Also repeated the "merge `ws/05-business` again" request under Needs
  from others, since that is the section the worker prompt tells the integrator to read and
  it was only in the status block.
- `2026-10-25 02:30` — **demo rehearsal of Scene 4 end to end against all six workstreams,
  with proposals 04 actually generated.** Ran `POST /api/ai/generate-opportunities`, then
  walked the owner's path and read every screen rather than trusting assertions:
  - **Dashboard**: nav badge 2, stat row (2 waiting / 2 upcoming / 15 RSVPs), both of 04's
    generated proposals rendered with the gradient `AiTag`, an amber "Awaiting approval"
    pill and the banded estimate reading "Estimated local interest: 6-9 people … This is an
    estimate, not RSVPs." No raw count anywhere.
  - **Proposal detail**: status timeline, the document, the estimate block with its
    popover, "Why this was suggested", the assumptions checklist, and all four decisions.
  - **Edit & approve** with the price $20 → $25, then publish.
  - **End state**: the events list shows `Published · AI suggestion · Beginner Pottery &
    Coffee Night · Thu, Oct 29, 6:00 PM · Creative · $25 · 10 left`, with edit, attendees
    and cancel on the row.
  The venue-zone fix holds throughout: every time reads as the venue's wall clock with the
  browser in UTC. The one blemish visible on screen is the seeded "Wheel Throwing Basics"
  sitting on a Monday that Kiln & Cup is closed — the fixture issue already reported.
  **Scene 4 is demo-ready**, with the caveat that the three fixes at the top of this file
  are not on `main` yet; without them the demo shows times in the presenter's zone.
- `2026-10-25 02:00` — **eyeballed the attendee screen against 06's real data, then found
  two seed bugs.** The masking path renders correctly for the first time with real RSVPs:
  counts first (9 confirmed, 4 shared), four real names and five "Attendee (private)",
  capacity 9/12. While reading it I noticed an event titled "Glaze & Latte Sunday" showing
  Thursday 09:00 against a fixture that says `start_hour: 11`, and pulled on it rather than
  assuming my formatter was at fault — it was not. **The seed computes event times in the
  seeder's timezone**, so demo data is not reproducible across machines; and because
  `days_from_now` drifts the weekday, a seeded event currently lands on a day its venue is
  closed, which makes 05's own validation reject an edit to it with a 422. Both are written
  up under Needs from others with a locally verified patch for the first. Not committed: 01
  had touched that file a minute before.
- `2026-10-25 01:30` — **all six workstreams are merged and the whole product is green.**
  02 and 06 landed while I was working, so `main` now has every migration. On a fresh
  `db reset` + `db:seed`: **800 unit, 213 integration, 62 db and 59 e2e pass with nothing
  skipped**, typecheck, lint and build clean. The 03↔06 `invitations_event_fk` collision I
  reported is resolved, and 05's last skipped test — the attendee path against 06's `rsvps`
  — now runs for real.
  One near-miss worth recording: `pnpm typecheck` showed 32 errors across 12 of 02's and
  06's files and I was about to report `main` as broken. The files were byte-identical to
  `main`; the cause was my own `node_modules` being stale after merging their dependency
  additions. `pnpm install` cleared all 32. Worth checking before blaming someone else's
  merge.
  Three 05 fixes are still only on the branch — see the status block at the top.
- `2026-10-25 01:05` — **screenshotted Scene 4 and found a time the assertions could not
  see.** Generated a proposal and read the detail page rather than trusting the suite: the
  header said "Thu, Oct 29, 8:30 PM" directly above an assumption reading "Staff available
  Thursday 18:30-20:15" — two different times for the same event on one screen. Last tick's
  fix pinned the editor's **inputs** to the venue zone but left the display formatters
  unpinned, so they rendered in whoever was rendering. An incomplete fix on my part; all
  three formatters now take the venue zone and a test asserts the header and the editor
  field agree for the same instant. Verified with the browser in UTC: the header now reads
  6:30 PM. 543 unit, 134 integration (1 skipped), 42 e2e. (cf29fb6)
- `2026-10-25 00:35` — **full six-workstream state is reachable and green; handed 03 a
  verified patch rather than editing their files.** Made the pending-fix status unmissable
  at the top of this file, since "merged" read as "nothing left to pull" and two bug fixes
  are still only on the branch. Then re-grafted 06 onto the integrated main (01–05) and
  reproduced the `invitations_event_fk` collision I reported last tick — it is still there,
  and 06 is the next merge, so it will turn main red. Worked out the fix and **confirmed it
  takes the suite to 135/135 with nothing skipped**, including one dependent change to a
  test of mine that lives in 03's file. Did not commit it: 03 committed two minutes ago and
  06 seven minutes ago, so editing files they are actively working in would collide. The
  exact change is written out under Needs from others for them to apply.
- `2026-10-25 00:05` — **05 is merged into main (with 04), and verifying the integrated
  state found two real bugs of mine.** Main now carries 01–05; **532 unit, 134 integration
  (1 skipped, waiting on 06) and 42 e2e pass with nothing else skipped** — Scene 4, the AI
  revision and 04's Scene 3 all run for real rather than against a graft.
  The integrator had pinned the browser timezone in two of 05's e2e specs to get them green
  on CI. That was a symptom, not the cause: the event editor rendered and parsed its
  `datetime-local` fields in the **browser's** zone while the server checks opening hours in
  `VENUE_TIMEZONE`, so any owner whose machine was not in the venue's zone saw times shifted
  by hours and had plausible entries rejected. Fixed at the source — the wall-clock helpers
  moved to a module both sides import, both conversions name the zone, and the two fields
  now say which zone they are in. The specs pin the browser to **UTC** instead, so they
  prove the app is zone-independent rather than hiding the dependency.
  The e2e server log then showed `agent_log.insert_failed … 23503`: **05 was passing a
  business id where `agent_action_log.user_id` references `profiles(id)`**, so every publish
  and proposal decision had been failing its audit insert since the day it was written. 01's
  helper logs and returns rather than throwing, so nothing ever surfaced. The acting user
  now travels in the dependency bundle and is null for a worker run; a publish records
  Rosa Delgado of Kiln & Cup where it previously recorded nothing.
- `2026-10-24 23:15` — **re-ran the six-way check against the new main; 05 is clean, and it
  surfaced a 03↔06 collision.** With 01+02+03 now on main, grafted 04's and 06's migrations
  so all 13 applied together again. **05's own suites pass completely**: `business-rls`
  13/13 (including the 06 attendee case), `proposal-decision` 8/8 (including Scene 4's
  path), 424 unit, 40 e2e. Two failures, both in **03's** tests and not caused by 05: 06's
  `0600` adds a foreign key from `invitations.event_id` to `events`, and 03's fixtures
  invite people to a hardcoded event id that no row has. Recorded under Needs from others
  with the one-line fix, since it bites only when 03 and 06 are both merged and is not
  mine to change speculatively. Also noted a transient seed failure right after
  `db reset` that briefly looked like a regression on my side. Grafts removed; the branch
  reports 113 integration (9 skipped) on main's schema.
- `2026-10-24 22:45` — **03 merged into main; integrated it.** One conflict, an import line
  in the seed loader where main dropped `seedGroupSchema` and 05 had added `SeedBusiness`
  for its hours and capabilities loading; both kept. Re-read 03's changed spec — their edits
  are internal (cascade rules, `archived_at`, RLS helper functions) and touch nothing 05
  consumes or exports. One of **03's** tests failed because of 05: it asserted their 06
  stand-ins "return nothing on a branch without events tables", which stops being true the
  moment 05 merges, since 05 owns `events`. Rewrote it to hold either way rather than
  deleting the check. Also recorded an ask for the integrator: `database.types.ts` predates
  05, so the typed client does not know 05's tables and consumers have to cast until it is
  regenerated. **424 unit, 113 integration (9 skipped), 37 e2e**; 8 migrations apply
  together and the seed still loads 05's capabilities.
- `2026-10-24 22:15` — **A1 audit against 06's consumer, and a schema hardening.** Checked
  acceptance criterion 1 properly for the first time: 06's `getNearbyBusinesses` selects
  exactly the columns `businesses` provides and handles the nullable ones correctly. Two
  things came out of it. PostgREST returns `numeric` as a JSON number, so the
  `distance_km.toFixed()` in 05's candidate reasons is safe — verified rather than assumed,
  since a string there would throw. And **`category` was plain text on both `businesses`
  and `events`**, with the enum living only in the spec comment and the Zod layer: 06 parses
  both columns with `z.enum(EVENT_CATEGORY)`, so a bad value would have surfaced as a crash
  in *their* code instead of failing at the write. Added check constraints there and on the
  two capability arrays that 04 matches against, and probed each one to confirm it rejects.
  All 13 migrations still apply together, the seed still loads, 349 unit + 38 integration
  pass with the full schema.
- `2026-10-24 21:50` — **six-way verification: everything passes with nothing skipped.**
  Grafted every other workstream's migrations (02, 03, 04, 06) plus 04's source locally and
  ran the lot. **All 13 migrations apply together on a fresh reset**, the seed loads, both
  of 05's cross-workstream FKs are present, and **349 unit + 38 integration + 34 e2e pass
  with zero skips** — every test 05 has written now runs, including Scene 4 and the AI
  revision. 04's feature also still typechecks against 05 with no errors. Grafts removed;
  the branch alone reports 29 integration + 30 e2e with the dependent cases skipped.
  Added a "ready to merge" summary at the top of this file for the integrator.
- `2026-10-24 21:20` — **verified the last unchecked cross-workstream seam: 06's `rsvps`.**
  Grafted 06's migration locally (never committed). Their table matches what 05 reads and
  their RLS is `auth.uid() = user_id`, which proves the earlier service-role fix was
  load-bearing — without it every attendee list and confirmed count would have come back
  empty once 06 merged. Their capacity flip also respects 05's status guard in a sound way.
  Found and fixed a dead test on my side: **T-I5 could never have run**, because it depended
  on 06's table while sitting behind 04's gate, and it only asserted the RPC half anyway.
  Rewritten where it can run, and made to skip visibly rather than return early and read as
  a pass. With 06 grafted: **30 integration**; without: 29 with 9 skipped. 349 unit and
  30 e2e green either way; typecheck, lint and build clean.
- `2026-10-24 20:50` — **P1-3 shipped; the checklist is now complete.** 04's branch already
  had the revise endpoint, so I grafted their feature locally (never committed) and built
  "Ask AI to revise" against the real contract rather than a guess: a note plus optional
  price, capacity or slot, with distinct copy for the revision limit, a rate limit, the AI
  being unavailable, and a route that has not merged. Verified end to end — the original
  proposal ends `expired` at revision 0 and a new `pending` one opens at revision 1 with the
  owner's note. With 04 grafted: **348 unit, 37 integration (1 skipped), 33 e2e**. Graft
  removed afterwards, so on `main` the branch reports 348 unit, 29 integration and the
  04-dependent cases skipped. Typecheck, lint and build clean. Every P0 and P1 item in this
  checklist is now ticked; what remains is watching main for 04 and 06.
- `2026-10-24 20:15` — **Scene 4 passes end to end for the first time, and getting there
  found two real bugs.** 04 has not merged, but its branch carries its migrations, so I
  applied them locally (not committed), reset, seeded and ran the suites that had been
  skipping for hours. All seven migrations apply together, both cross-workstream FKs
  appear, and **37 integration (1 skipped) and 32 e2e tests pass** including the full
  Scene 4 flow: open the pottery proposal, edit & approve with the price $20 → $25, publish,
  and see Published in the events list. The two bugs are written up under Decisions; the
  first would have failed the demo. Removed 04's migrations again afterwards, so on `main`
  the suite honestly reports 29 integration + 29 e2e with the 04-dependent cases skipped.
  Also stopped committing 32 theme screenshots that were landing in 01's snapshot
  directory. **335 unit tests**; typecheck, lint and build clean.
- `2026-10-24 19:45` — **post-merge design-system and coverage pass.** Re-read the changed
  `design-system.md`: 01 added `--color-warning-ink` because `--color-warning` fails AA on
  `--color-warning-soft`, so the reconfirm banner now uses it. Also found `src/app/globals.css`
  orphaned by the merge — the root layout loads 01's `src/styles/global.css`, which already
  provides `rise-in` and the `@theme inline` mapping, and nothing referenced the `.ai-tag` /
  `.ai-ring` classes my copy defined now that `AiTag` is 01's component. Checked the one
  thing that would have been a silent regression: 01's `@theme inline` does map `--text-md`
  and the rest of the scale, so 05's `text-md` / `text-sm` classes still resolve to the
  design tokens rather than Tailwind defaults. Added tests for `requireBusinessPage` and
  `requireVenueContext`, the two modules left at zero coverage by the merge; the measured
  tree is now 89.6% lines. **335 unit, 29 integration (9 skipped)**; typecheck, lint and
  build clean. Next: watch main for 04.
- `2026-10-24 19:20` — **01 merged; integrated it (37 conflicts) and everything is green
  again.** Took main's version of every shared file and adapted 05 to the real contracts;
  the whole list is under Decisions. Net effect: 05 got smaller — the shell, the sign-in
  route, the notify and agent-log stubs, the seed runner and the `Field` wrapper all
  deleted in favour of 01's. **326 unit, 29 integration (9 skipped) and 29 e2e (3 skipped)
  tests pass** on a fresh `db reset` + `db:seed` with 0100/0500/0501 applied together;
  typecheck, lint and `next build` clean. The skips are all Scene 4, still waiting on 04's
  `event_proposals`. Next: watch main for 04.
- `2026-10-24 18:35` — **spec re-read found a missing feature; shipped it.** Screen 5 in
  spec §7 asks for "actions (edit, publish, cancel)" on each events-table row and only edit
  was there — publish and cancel were buried in the editor. Rows now publish in place and
  send the owner to the editor with the reason panel already open for a cancel, and a row
  only offers what the status machine allows (a cancelled event shows neither). A small
  client mirror of the two status questions keeps the `server-only` module out of the
  bundle, with a unit test asserting the two never disagree. Also covered two pieces of
  load-bearing logic that had none: the `/api/dev` guard, and the mapping that puts a
  server validation failure under the right input. Verified at 320px by eye as well as by
  the overflow assertion. **274 unit + integration tests, 26 E2E, 6 skipped**; `tsc`,
  `eslint` and `next build` clean.
  Note for the demo: the E2E leaves its events behind, so run
  `npx supabase db reset && pnpm db:seed` before presenting.
  *(Superseded 19:20: the suite now calls 01's `reseed()` between specs.)*
- `2026-10-24 18:05` — **ran the full clean-state check for the first time; it found a bug
  that would have broken the demo.** `db reset` → `db:seed` → `typecheck` → `lint` →
  **259 unit + integration tests** → **24 E2E**, all green on a freshly reset database.
  Getting there took three real fixes. The big one: **every form silently failed to
  navigate after saving** in a production build — save an event, approve a proposal or
  finish onboarding and the request would succeed while the button stayed disabled and the
  page never moved. Two independent causes, written up under Decisions; neither is
  reproducible in `next dev` or by reasoning about the code, only by driving the UI in a
  production build. Also hardened the `/api/dev` guard (it keyed off `NODE_ENV`, which is
  both too weak and too strong) and moved the E2E suite onto a production build, which is
  what exposed the navigation bug in the first place. Scene 4's 6 cases still skip, waiting
  on 04.
- `2026-10-24 17:30` — **the business UI has now actually been rendered, and the whole
  suite runs.** The Playwright suite was blocked on 01's `/login`, so a dev-only
  `POST /api/dev/session` removes that dependency and **24 of 30 cases pass**: the manual
  event lifecycle end to end (create a draft → edit → publish → attendee page → cancel with
  a reason), the two refusals an owner actually hits, another venue's event being
  unreachable by url, and the theme matrix in both themes at 320 / 768 / 1024 / 1440 with
  no horizontal scroll. Screenshots reviewed by eye in light and dark; the Meta-aligned
  surfaces, Meta blue actions and empty states all render as specified. Two fixes came out
  of it: field errors now carry `aria-describedby` / `aria-invalid` so a screen reader ties
  the message to its input, and the Playwright `webServer` probe points at a route that
  answers, because 01 owns `/` and it does not exist yet. Scene 4's 6 cases skip visibly
  until 04 migrates `event_proposals`. **Full state: 259 unit + integration tests pass,
  24 E2E pass, coverage 95.2% lines, `tsc` / `eslint` / `next build` clean.**
- `2026-10-24 17:05` — **stood up the real stack; it found two bugs, both fixed and
  pushed.** Docker was already running here and the supabase CLI ships on npm, so the CLI
  is now a devDependency and the whole local stack runs from a clone — closing the blocker
  that had stood since the first tick. **Both migrations apply cleanly on a fresh
  `db reset`**, `pnpm db:seed` creates the three venues with their owners and capabilities
  and is idempotent, and `business_candidates` correctly returns only Kiln & Cup for a
  creative cohort in the Mission (0.011 km) and nothing for a 400-person cohort.
  The two bugs are written up under Decisions: a SECURITY DEFINER / `current_user`
  mistake that let **any signed-in user act on another venue's events**, and a
  missing-table guard that checked Postgres's `42P01` when PostgREST reports `PGRST205`.
  Also made the cases that wait on another workstream's table report as `skipped` instead
  of passing vacuously. **259 tests pass (247 unit + 12 real integration), 9 skipped**;
  coverage 95.2% lines. Next: the Playwright suite is the only thing 05 still cannot run,
  and it needs 01's `/login`.
- `2026-10-24 16:19` — **route boundaries and a real audit for criterion 3, pushed.** The
  business screens are server components with no `loading.tsx`, `error.tsx` or
  `not-found.tsx`, so a slow query rendered nothing and a thrown `ApiError` fell through to
  Next's default page; all three now exist, with a skeleton that mirrors the shell's
  dimensions and an error state that tells an owner mid-decision that nothing was published.
  Acceptance criterion 3 ("no route returns user ids, raw cohort counts, or non-consented
  names") was only covered per-builder, so `tests/unit/business/privacy.test.ts` now seeds
  sentinel owner/user/cluster ids, a private attendee name and a raw cohort count and
  asserts none of them appear in what any route's read path actually returns — a leak added
  later fails there whichever module adds it, and the last case poisons a payload on purpose
  so the guard cannot silently stop working. **247 unit tests pass**, coverage 95.2% lines /
  87.0% branches.
- `2026-10-24 16:12` — **cleanup and error-path pass, pushed.** Removed the duplicate venue
  query path (`candidates.ts` was reaching for `supabaseAdmin()` directly alongside the
  store-port path in `index.ts`; the source is now always injected, so there is one
  database path and the scoring module has no Supabase dependency) and the unused
  `localTimeLabel`. Added the edit, reconfirm and data-inconsistency tests: each editable
  field on its own, which fields do and do not trigger a reconfirm notification, an owner
  view whose capabilities row is missing, and a store that reports an approval with no
  event. **234 unit tests pass**; coverage 95.2% lines / 86.9% branches, with candidates,
  events, validate and decide at 100% of lines. Next: the remaining uncovered branches are
  all in `store-supabase.ts` error paths and are better pinned by the integration suite,
  which still cannot run here.
- `2026-10-24 16:05` — **fixed a privacy and correctness bug in the attendee reads.**
  `rsvps` and the `profiles(display_name)` join were being read with the business owner's
  own client, which breaks privacy invariant 1 (a business must never read `profiles`) and
  would have silently returned zero once 06 lands its RLS, since those policies scope
  `rsvps` to each attendee — so `confirmedCount` and every attendee list would have been
  empty on the demo. Both now go through the service role and are masked by
  `buildAttendeeList()` before they leave the server. Every service-role read also degrades
  to its empty value with a warning when `SUPABASE_SERVICE_ROLE_KEY` is unset, so a missing
  key can no longer 500 the dashboard. 223 unit tests pass; coverage 93.9% lines.
- `2026-10-24 15:58` — **first push: `ws/05-business` @ `8b3d03a`.** Identity unblocked by
  the clone's owner, so the whole workstream went up as 11 conventional commits, one
  concern each: scaffold, shared contracts, migrations, tokens + primitives, domain layer,
  decision flow, API routes, screens, seed, tests, progress log. All 11 authored
  `Joshua Wu <joshwu10806@gmail.com>` with no AI attribution. 220 unit tests pass,
  `tsc`/`eslint` clean, synced with `origin/main`. **Ready for the integrator to merge** —
  `ws/01-core` should go first, then this branch; read "Needs from others" after merging,
  since 06 in particular must move event status only through `transition_event_status()`.
  Next: the two Blocked items are now only the missing `supabase` CLI (integration and E2E
  have still never executed) and 04's revise endpoint for P1-3.
- `2026-10-24 15:55` — **wakeup; main unchanged (no spec changes to re-read), identity still
  unset so nothing could be committed.** Worked the Never-idle list: **P1-2 analytics**
  shipped (`server/analytics.ts` + a new section on `/business/insights`: past events,
  attendance, average fill, repeat attendees as a count only); **P1-3 recorded as blocked**
  with the exact endpoint 04 would need. Split `OnboardingWizard` (370 -> 117 lines) and
  `DecisionPanel` (243 -> 207) and unit-tested the pure parts; ran the design-system theme
  audit (no hex outside `tokens.css`, the AI gradient appears only in `AiTag`/`AiRing`, no
  Meta or Facebook wordmarks, no raw `rgba()`). **220 unit tests pass**, coverage 93.8%
  lines, `tsc`/`eslint`/`next build` clean. Next: still blocked on identity to commit; will
  keep hardening edge cases and re-check `main` on each wakeup.
- `2026-10-24 15:49` — **P0 complete except what needs a live database.** API routes
  R1-R12, UI U1-U7 (tokens, primitives, business shell, onboarding wizard, dashboard,
  proposal inbox + detail + decision panel, event editor, events table, attendee list),
  seed fixtures S1-S2, the public surface `src/features/business/index.ts`
  (`findCandidateBusinesses`, `getBusinessPublicCard`), P1 insights, 20 integration tests
  and 22 Playwright tests. **179 unit tests pass**, coverage on
  `features/business/server` is **93.6% lines / 83.7% branches** (bar: 80%),
  `tsc --noEmit`, `eslint` and `next build` are all clean (21 routes). Integration and E2E
  self-skip without a stack. Everything is still uncommitted — see Blocked (git identity).
  Next: a theme pass against the design-system checklist, then P1-2 and P1-3.
- `2026-10-24 15:31` — **F1-F5, D1-D9, T-U1-T-U6 done.** Scaffold runs; `0500_business.sql`
  and `0501_business_rpc.sql` written (businesses, business_capabilities, events, RLS,
  status-guard trigger, `decide_proposal` / `transition_event_status` / `cancel_event`
  RPCs, `business_candidates` prefilter, guarded FKs to 04's `event_proposals`). Domain
  layer complete behind a `BusinessStore` repository port: status machine, capability
  validation, demand banding, attendee masking, candidate scoring, onboarding,
  event lifecycle, `decideProposal`. 125 unit tests pass; `tsc --noEmit` and `eslint`
  clean. Still uncommitted — see Blocked (git identity). Next: `store-supabase.ts`,
  the API routes (R1-R12), then the UI (U1-U7).
