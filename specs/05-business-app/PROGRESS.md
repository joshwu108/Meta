# Workstream 05 — Business Application · PROGRESS

Branch: `ws/05-business` · Spec: [`specs.md`](./specs.md) · Contracts: [`../README.md`](../README.md)

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
- [~] **T-I5** cancel notifies RSVPs — written; self-skips until 06 merges `rsvps`
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
- [!] **P1-3** "Ask AI to revise" on a proposal — **blocked**: 04 exposes no revise
  endpoint. See Needs from others for the exact ask.

---

## Decisions

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

- **01** — scaffold, `envelope.ts` with `withBusinessOwner`, `notify()`, `logAgentAction()`,
  `src/shared/types.ts`. 05 stubs all of them meanwhile; nothing is blocked. Two asks:
  - **`/login` and `/signup?as=business`.** The Scene 4 Playwright test signs in through
    `/login`; it self-skips until that page exists.
  - **`src/shared/types.ts` should absorb the 05-owned types** added below the marker in
    this branch's copy (`DemandBand`, `WeeklyHours`, `BusinessCapabilities`,
    `BusinessOwnerView`, `BusinessEvent`, `EventEdits`, `ProposalDocument`,
    `ProposalSummary`, `ProposalDetail`, `AttendeeList`, `BusinessInsights`).
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
