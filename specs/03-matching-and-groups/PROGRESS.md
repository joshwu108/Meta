# Workstream 03 — Progress

Branch: `ws/03-matching`. Spec: [`specs.md`](./specs.md). Shared contracts: [`../README.md`](../README.md).

## Foundations (unblock others first)

- [x] Migration `0300_social.sql` (tables, RLS) + `0301_social_functions.sql` (guard triggers, service-role functions)
- [x] Contracts: `getCompatibilityScore()` from `src/features/matching/index.ts`, `getGroupMemberIds()` from `src/features/groups/index.ts`
- [x] Helpers 06 asked for: `getConnectionIds`, `getBlockEdges`, event-invitation create/read, top matches for Discover (`getSuggestedPeople`), public groups (`getPublicGroups`)
- [x] Zod schemas for request bodies, rows and DTOs
- [x] Stubs for 02 (`getSharablePreferences`, `explainRecommendation`) and 06 (`getUpcomingEventsForUser`) in `server/stubs.ts`
- [x] MOCK_AI fixture `groups.plan_activities.json`

## Acceptance criteria (P0, spec §10)

- [x] AC1. Seeded demo user receives ranked matches whose top 3 share `creative` interests and `thu_eve` (verified with the interim 02 §8 preferences fixture until 02's seed lands)
- [x] AC2. Every match card shows an explanation grounded in shared fields
- [x] AC3. Connection, block, report, group create/invite/accept/remove/leave all work and respect authorization
- [x] AC4. Group planner produces 2–4 suggestions referencing only shared slots and consenting members' data
- [x] AC5. A group can view upcoming events (through 06's contract) and open them (contract-level test against 06's stand-in; real events need 05/06 on main)

## Build items (P0, spec §3, §6, §7)

- [x] Compatibility engine: hard filters, weighted score (35/25/20/10/10), explanation
- [x] `GET /api/matches`: candidate set (≤ 500), 5-minute per-viewer cache, top 20
- [x] `POST /api/connections`, `PATCH /api/connections/:id`, `GET /api/connections`
- [x] `POST /api/users/:id/block`, `POST /api/users/:id/report`
- [x] `POST /api/groups`, `GET /api/groups`, `GET /api/groups/:id`, `PATCH /api/groups/:id`
- [x] `POST /api/groups/:id/invite`, `PATCH /api/invitations/:id`
- [x] `DELETE /api/groups/:id/members/:userId`, `POST /api/groups/:id/leave` (with owner transfer)
- [x] `POST /api/groups/:id/plan` (group planner)
- [x] UI `/match` (Screen 3)
- [x] UI `/groups` (Screen 4)
- [x] UI `/groups/:id` (Screen 5)
- [x] Seed: group members, `connections.json` (6 accepted edges), one block pair

## Tests (spec §9)

### Unit
- [x] Score components with golden values: identical users = 100, disjoint = 0, adjacent group size = 0.5
- [x] Hard filters
- [x] Haversine
- [x] Planner pre-work: slot intersection, budget envelope
- [x] Suggestion validation drops bad event ids and slots

### Integration
- [x] Matches exclude non-discoverable, non-consenting, blocked, already-connected
- [x] Connection uniqueness constraint
- [x] Recipient-only accept
- [x] Block declines pending and hides both ways
- [x] Private group invisible to non-members
- [x] Owner cannot be removed
- [x] Leave with transfer
- [x] Planner refuses with < 2 consenting members
- [x] Planner never includes names in prompt input (assert on captured mock input)

### E2E
- [x] Scene 2: demo user sees ≥ 3 matches with explanations → connects with one → creates "Thursday Makers" (private) → invites 2 → second seeded user accepts via API → roster shows 2 active

## P1

- [x] Voting on planner suggestions (`POST /api/groups/:id/plans/:planId/vote`)
- [ ] Send a chosen `new_activity` suggestion to 04 as a group-originated proposal request — eligibility (≥ 50% votes) and the "Request venue" button are done; `getGroupVenueRequest()` is exported for 04; needs 04's `source: 'group'` path
- [x] Filters on `/match` by interest and social goal
- [x] Basic 1:1 messaging between accepted connections (text only, polled)
- [x] Public group discovery (`/groups/discover`)

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

- 2026-10-24: Matches exclude anyone with an existing connection row, declined included: a pair can only ever have one edge, so a declined person could not be re-requested and should not resurface.
- 2026-10-24: `GET /api/matches` returns `MatchCard[]` as specced; the page calls the service directly to get the empty-state reason (`not_discoverable`, `no_location`, `no_candidates`). Each cache fill logs one `score_matches` agent action for the viewer.
- 2026-10-24: Match explanations come from 02's `explainRecommendation` (cached 24h by viewer, candidate, prefs hash) behind a grounding check: the text must cite a shared interest, a shared slot's day or a shared goal, otherwise a deterministic sentence built from shared fields is used. AC2 holds even when a MOCK_AI fixture returns the same text for every card.
- 2026-10-24: Connection requests and group invites reach only people who are discoverable, already connected, or share an active group; blocked or unreachable recipients get NOT_FOUND so a block is never disclosed. A duplicate request is CONFLICT with `{ connectionId, direction }` details.
- 2026-10-24: Reports are inserted with a server-generated id because reporters have no read policy on `reports`.
- 2026-10-24: Group invites skip blocked pairs (with the inviter), current members and unreachable people, and report the skipped counts. Re-inviting someone who left or was removed reopens their membership.
- 2026-10-24: Admin group edits go through the service role after the TypeScript check so `kind` follows `visibility`; RLS still limits direct edits to admins. Only the owner can remove an admin; admins come from ownership transfer (the spec has no promote route).
- 2026-10-24: The group Events tab lists events shared with the group (event invitations) and events active members have a confirmed RSVP for, through 06's contracts only; it shows a count of members going, never names, and the viewer's own RSVP status.
- 2026-10-24: Planner prompt id is `groups.plan_activities` (spec); it replaces 01's reserved `groups.plan_activity` in `src/lib/ai/prompts/index.ts`, where its system prompt is registered.
- 2026-10-24: Planner requires at least one slot all consenting members share (VALIDATION otherwise). Candidate events: published, in a shared slot, in a member category, within the budget envelope. If the model fails, suggestions come from the aggregates; every plan has 2–4 suggestions and leads with a candidate event when one exists. Members' full and first names are scrubbed from the request before it reaches the model. Each consenting member gets one `group_plan` agent log row.
- 2026-10-24: Votes toggle per member and suggestion; a `new_activity` that needs a venue becomes eligible to send to 04 at ≥ 50% of active members.

- 2026-10-24: UI uses 01's primitives and tokens from `@/features/core/components/ui`. `/match` leads with the top match (breakdown open) and lists the rest as compact rows; `/groups` leads with invitations when there are any; on a group page the planner is the lead element. Chips show shared tags when there are any (their categories are implied), otherwise shared categories.
- 2026-10-24: Client components call routes through 01's `src/lib/api/client.ts` and 03's `src/lib/api/use-api-action.ts` hook (03's own `fetch-json.ts` was removed once 01 landed). A missing route (e.g. 04's group venue request before 04 ships) shows "This isn't available yet" instead of a network error.
- 2026-10-24: The invite picker lists accepted connections, people with an open request, then matches; the server re-checks reachability and blocks.
- 2026-10-24: `tests/fixtures/social/preferences.json` is an interim copy of 02 §8's seed design used by the AC1 integration test and the Scene 2 E2E (applied with the service role after the seed). It is never loaded by `pnpm db:seed`, so it cannot collide with 02's `preferences.json`.

- 2026-10-24: P1 messaging adds `0302_direct_messages.sql` (`direct_messages`, RLS: both parties of an accepted connection read and write, so a block hides the thread), `GET/POST /api/connections/:id/messages` (`after` for polling) and a Connections tab on `/match` whose chat polls every 5 s. No notification type exists for messages, so none is sent.

- 2026-10-24: The candidate prefilter runs on radius in SQL and caps at 500 but does not prefilter by shared category in SQL (spec §12 risk mitigation): that would mean reading `user_preferences` outside 02's consent boundary. Categories are compared after the consent-gated batch read.
- 2026-10-24: `/match`, `/groups` and `/groups/:id` have route `loading.tsx` skeletons (explanations can take a moment with the live model) and `error.tsx` boundaries with a retry. Tab strips scroll sideways at narrow widths.

- 2026-10-24: `getGroupVenueRequest(groupId, planId, suggestionIndex)` (from `@/features/groups`) returns the shape 04 asked for: `{ groupId, planId, title, category, slot, neighborhoodLabel, centerLat, centerLng, memberCount, groupSizeMode, budgetMaxCents, activityPrefs }` plus `suggestionIndex`, `description`, `estimatedCostCents`, `votes`. Location fields are null when no consenting member shared a location; activity tags need at least two members (04's tag floor). Null unless the suggestion is a `new_activity` that needs a venue and has ≥ 50% of active members' votes.
- 2026-10-24: Plan for when ws/01-core reaches main (read on its branch, never merged). 01 changed 23 files after the copy; only `src/lib/ai/prompts/index.ts`, `supabase/seed/loaders/domain.ts` and `supabase/seed/runner.ts` were also edited here. Resolution: take main's version of every other copied 01 file; take main's `runner.ts`; keep `export { loadGroups } from './social'` in `domain.ts` (01's loader still omits `interests`, `kind` and the pending invitation); register `{ name: 'connections', run: loadConnections }` and `{ name: 'blocks', run: loadBlocks }` in `loaders/registry.ts` `AFTER_ALL` and read their counts from `summary.extra` in `tests/integration/social/seed.test.ts`; put the `groups.plan_activities` system prompt in `prompts/groups.ts` as `GROUPS_PROMPTS`; switch client calls to 01's `src/lib/api/client.ts` if it covers `fetchJson`; add the now-required `interestCategories` to test fixtures; regenerate `database.types.ts`.

- 2026-10-24: `0303_social_reachability.sql` adds `can_reach(other)` (caller-scoped, security definer) to the `conn_insert` policy, so direct PostgREST inserts face the same rule as the API: the recipient is discoverable or shares an active group.
- 2026-10-24: Robustness: social notifications are best-effort (`notifySafely`) because the action they report is already committed; match explanations run 5 at a time; the 02 stub chunks id filters to 100; `/match` keeps Zod out of its client bundle (23.5 → 9.5 kB). Integration files each use their own coarse test location and delete users serially (parallel cascading deletes could deadlock and leak a user into another file's matches).

- 2026-10-24: Match explanations are also rejected when they name an interest or day only one side has (02's MOCK_AI fixture says "You both love pottery…" for any input that mentions pottery, which would otherwise appear on every demo card).

- 2026-10-24: Edited `specs.md` §4 (RLS block now shows the helper-based policies actually shipped; `creator_id`/`sender_id` cascade, `requested_by` set null, `archived_at`) and §6 (P1 messages route) so the spec matches the build.

- 2026-10-24: `/match?focus=<userId>` (02's agent suggestion cards deep-link there) moves that person to the lead card, labelled "Suggested by your agent"; an unknown or no-longer-matching id is ignored.

- 2026-10-24: Cross-branch schema check (one-off, rolled back, nothing committed): 04's `0400`–`0404`, 05's `0500`/`0501` and 06's `0600` applied in fresh-reset order on top of 03's `0300`–`0303` inside one transaction on the local Supabase stack. All apply; 06's deferred FKs (`groups_event_fk`, `invitations_event_fk`) land on 03's tables; `tables_without_rls()` returns none. 04's `0404_group_proposals.sql` keys group proposals by (group, plan, suggestion), matching `getGroupVenueRequest`.

- 2026-10-24: Scheduling conflicts (02 P1, answering 02's ask): when consenting members share no slot, the planner calls `resolveGroupSchedule(members)` (same-signature stand-in in `groups/server/stubs.ts` until 02 is on main) and plans for its best options that at least half of them (never fewer than two) can make. Each suggestion carries `freeCount`; the UI shows "3 of 4 free" and explains why; the model sees `everyoneFree: false` and per-slot counts, never the member ids the resolver returns. Still VALIDATION when no slot reaches that quorum.
- 2026-10-24: "Request venue" is disabled below `MIN_COHORT_SIZE` members (04 rejects smaller groups) with a hint, and the success toast names the venue from 04's `{ proposalId, businessName }`; 04's 404/409/400 messages show as-is.

- 2026-10-24: Merged main after 01 landed (27 add/add conflicts). Took main's version of the 19 copied 01 files this branch never edited; kept 03's `/match` and `/groups` pages over 01's placeholders, 03's `groups.json` and seed schemas, and `export { loadGroups } from './social'` in 01's new `domain.ts`; took main's `runner.ts` and registered `connections` and `blocks` in `loaders/registry.ts` `AFTER_ALL` (counts now in `summary.extra`); moved the planner system prompt into `src/lib/ai/prompts/groups.ts` (`GROUPS_PROMPTS`); regenerated `database.types.ts`. `MatchingPreferences` is now just `SharablePreferences` (which carries `interestCategories`), the 02 stand-in uses the shared `ExplainInput`, and client calls go through 01's `src/lib/api/client.ts` (local `fetch-json.ts` removed). 02's `0200_agent.sql` copy stays until 02 reaches main.

- 2026-10-24: `/match` and `/groups/:id` keep the selected tab in `?tab=` (03's `src/lib/use-url-tab.ts`) instead of component state seeded once from the URL. 01's bell opens `payload.href` with a client-side push that keeps the page mounted, so a request notification opened from `/match` used to leave Recommended showing. Tab clicks rewrite the URL in place (no history entry, no server round trip), and the default tab stays out of the URL.

## Needs from others

- 02: return `interestCategories` from `toSharable` (the shared type now requires it since 01 landed). Until then 03 derives categories from interest tags at runtime.
- 02: `supabase/seed/fixtures/preferences.json` (02 §8). Scene 2 and AC1 need seeded preferences and consent; 03's tests apply an interim copy of the 02 §8 design.

- 06: swap your 03 stubs for the real exports, same signatures: `getConnectionIds`, `getBlockEdges`, `getSuggestedPeople`, `getPendingConnectionRequests` (adds the requester's public card) from `@/features/matching`; `getGroupMemberIds`, `createEventInvitations`, `getPendingEventInviteeIds`, `getPendingEventInvitations`, `getPublicGroups` from `@/features/groups`.
- 06: `EventSummary` has no `category`, so the planner calls `getEventPublic` per candidate; adding `category` to `EventSummary` would remove those lookups. `getUpcomingEventsForUser` also does not say whether an RSVP is shared with attendees, so group pages show only a count of members going.

- 04 (P1 group proposals, answered): `getGroupVenueRequest` is exported from `@/features/groups` with the shape you asked for (see Decisions). The group page's "Request venue" posts `{ source: 'group', groupId, planId, suggestionIndex }` to `POST /api/ai/generate-opportunities` once a `new_activity` that needs a venue has ≥ 50% of active members' votes.

- 01: `Sheet` says "focus returns to the trigger", but it does not manage focus. Opening leaves focus behind the backdrop, Tab walks the page underneath, and closing restores nothing. 03 works around it: its sheets `autoFocus` their first field (Cancel on destructive confirmations), and on close 03 puts focus back on the trigger or on the panel the action happened in (`src/lib/use-focus-fallback.ts`). Asking `Sheet` to keep focus already inside the dialog (else focus the first focusable), keep Tab within it while open, and on close focus the element that opened it when it is still in the page; 03 can then drop its workaround.

- ~~01: at 320px the consumer `TopBar` is 27px wider than the viewport~~ fixed on main; every 03 page fits at 320px in both themes.

- 01: design-system §1 promises AA contrast on every token pair, but axe-core finds these under 4.5:1 (in 01's Avatar initials, selected Chip, active nav item, Tabs, primary Button, link color, LoginForm/SignupForm alerts and StatusPill, and in 03's links, chat bubbles and chat error): light brand text on canvas 4.30 and on brand-soft 4.20; dark brand text on surface 4.44, on surface-2 3.25, on brand-soft 3.40; dark white on brand 3.46; danger on danger-soft 3.94 light / 4.01 dark; dark danger on surface 4.21; light success on success-soft 2.89 (every green StatusPill). Values that pass and keep the look: a text-only brand ink `#0659e0` light / `#62a6ff` dark (≥ 4.5 on surface, canvas, surface-2 and brand-soft), dark brand fill `#1a6fe0` (white text 4.78), danger ink `#c8102e` light (5.02 on danger-soft) / `#f76a80` dark (5.11), success ink `#1f7a35` light (4.75). 03 uses the tokens as they are, so it picks up the fix with no 03 change.

- ~~01: `NotificationList` could follow 03's `payload.href`~~ done on main: the bell marks read, then navigates.

- 02: `adminLoadSources` and `adminRecentShareLogs` in `server/repo.ts` (and the attendee-sharing read) put every id in one `.in()` filter, and the local gateway answers `414 URI too long` above about 200 uuids (measured: 200 ok, 250 rejected). 03 now reads candidates (up to 500) 100 ids per call, but chunking inside those helpers would also protect 04's and 06's callers.

- 02 (when on main): 03 will import `MATCHING_OPT_OUT_EMAILS` from your `tests/fixtures/consent-cases.ts` and assert those seeded users never appear in or see matches (your AC3), and swap the `resolveGroupSchedule` stand-in for your export. Both wait on 02's seed and code reaching main.

## Blocked

## Log

- 2026-10-24 19:56 CDT · CI green on 45cd504. Closing a 03 sheet or removing the focused row no longer drops focus to `<body>`: Create and Edit return it to their buttons; Match, Connections and Members move it to the panel or list the action happened in, never at page load. Scene 2 asserts it after sending a request. 24 E2E green. Next: watch main.
- 2026-10-24 19:50 CDT · keyboard pass on 03's sheets: 01's `Sheet` left focus behind the backdrop, so each 03 sheet now focuses its first field (Cancel on destructive confirmations), with E2E checks; asked 01 for focus trapping and return. Split `SafetyMenu` and `ChatSheet` under the 50-line function limit, which also stops a chat draft carrying over to the next person. 155 unit, 101 integration, 24 E2E green. Next: watch main.
- 2026-10-24 19:40 CDT · CI green on the merged branch (all three jobs). Added a Playwright check of every 03 screen and tab at 320/768/1024/1440 in both themes (no sideways scroll, screenshot per width). Found that one `in.(...)` filter over about 200 uuids gets `414` from the gateway: the candidate read (up to 500) and the exported `getPublicCards` / `getPendingEventInviteeIds` now read 100 ids per request, with unit and integration tests that fail without it; asked 02 to chunk its own reads. Dry-run merge against ws/02-agent conflicts only on generated types, the seed registry and vitest config. 155 unit, 101 integration, 24 E2E green. Next: watch main.
- 2026-10-24 19:30 CDT · main moved (01's `@aside` slot, Chip/Switch a11y, `server-only` alias, Node 22 CI). Merged cleanly; 154 unit, 100 integration, 22 E2E green. 01 answered both 03 asks: the bell follows `payload.href`, and every 03 page fits at 320px. Fixed a bug at that seam: opening a request notification while `/match` was open left Recommended showing. Tabs now follow `?tab=`, and Scene 2 opens Maya's request from the bell (that step fails without the fix). 03's spec puts nothing in the right rail for Match or Groups, so both keep 01's default agent strip. Next: watch main.
- 2026-10-24 19:21 CDT · accessibility pass: axe-core (WCAG 2.1 A/AA + best practice) on `/match` (3 tabs), `/groups`, `/groups/discover` and a group's 3 tabs in light and dark, plus every 03 sheet and menu open at 390 and 1280px. No structural, ARIA or naming violations. Contrast failures trace to 01's tokens (asked above) except three non-actionable labels 03 had colored brand blue against the design system's color rules; those now use neutral text or the neutral StatusPill. The person-card menu now supports arrow keys, Home and End, and returns focus to its trigger on Escape and Tab; the safety E2E covers it. Next: watch main for 01/02/04/05/06.
- 2026-10-24 19:00 CDT · wakeup: main unchanged. GitHub CI on ws/03-matching (01's workflow, now merged in) is green on all three jobs: lint/typecheck/unit, migrations + generated-types check + integration on a fresh Supabase, Playwright. 01's `@aside` right-rail slot is still on ws/01-core; 03 can add `@aside/match` once it reaches main. Next: watch main.
- 2026-10-24 18:40 CDT · wakeup: 01 landed on main. Merged main (27 conflicts resolved per plan), adopted 01's prompt and seed registries, shared types and API client. 153 unit, 100 integration, 21 E2E green on the merged tree. Next: watch main for 02/04/05/06; swap stubs as they land.
- 2026-10-24 18:20 CDT · wakeup: main unchanged, no new asks for 03. Checked the conflict-planning UI in the browser ("2 of 3 free", venue-size hint) and ran all 19 Playwright specs green. Next: watch main.
- 2026-10-24 18:02 CDT · wakeup: main unchanged. Answered 02 (planner uses resolveGroupSchedule for conflicts) and 04 (cohort-size gating, venue name in toast). 146 unit, 100 integration green; planner/Scene 2 E2E green. Next: watch main.
- 2026-10-24 17:58 CDT · wakeup: main unchanged. Split MatchScreen, InvitePicker and ReportSheet so every function is under 50 lines (UI E2E green); cross-branch schema check with 04/05/06 migrations passes. Next: watch main.
- 2026-10-24 17:50 CDT · landed: `getPendingConnectionRequests` export for 06's Activity hub, `/match?focus=` deep links for 02's agent cards, spec §4/§6 aligned with the build. 143 unit, 98 integration, 19 E2E. Next: watch main.
- 2026-10-24 17:45 CDT · landed: stricter explanation grounding (no claims about unshared interests or days), planner + vote and block/report E2E tests, precise merge plan for 01. 143 unit, 97 integration, 18 E2E. Next: watch main.
- 2026-10-24 17:35 CDT · landed: RLS reachability for connection requests (0303), best-effort notifications and bounded fan-out, bundle trim, production build green, flaky-test fix (location isolation + serial cleanup). 142 unit, 97 integration, 16 E2E. Next: watch main; adopt 01's layout when it lands.
- 2026-10-24 17:20 CDT · read 01/04/06 branches: 06 aligned its stubs to 03's exports; 04 asked for `getGroupVenueRequest` (now matches their shape); 01 split prompts and seed loaders into per-workstream registries (merge plan recorded). main still has only specs. Next: watch main, adopt 01's layout when it lands.
- 2026-10-24 17:17 CDT · clean-state check green (db reset → seed → 138 unit, 96 integration, 16 E2E, typecheck, lint). Landed loading/error states, 320px tab overflow fix, icon and menu-focus polish, group edge-case tests. Next: keep syncing main for 01/02/06 landings; swap stubs when they arrive.
- 2026-10-24 17:12 CDT · landed: `getGroupVenueRequest` export for 04, contract tests for every 03 export, P1 direct messages (migration, routes, Connections tab, polled chat) with integration and E2E tests. Coverage on 03 server code: 92% statements, 83% branches. Next: clean-state check, design checklist pass, edge cases.
- 2026-10-24 17:05 CDT · landed: `/match` (lead card, compact rows, filters, connect/block/report sheets, requests tab), `/groups`, `/groups/:id` (planner lead, votes, venue request, events, members/invite/transfer/leave), `/groups/discover`; AC1 integration test; Scene 2 Playwright test. All P0 items ticked. Totals: 138 unit, 78 integration, 15 E2E green (earlier log line's "112" should have read 120). Next: P1 messaging, 04 venue-request export, coverage, clean-state check.
- 2026-10-24 16:45 CDT · landed: matches service + `GET /api/matches` with grounded explanations; connection, block and report routes; group services, invitations, removal, transfer, leave/archive; group planner (consent-gated aggregates, name scrubbing, validation, fallbacks) and votes; matching/groups contracts for 06. 112 unit+integration tests across 03 (63 unit, 57 integration incl. seed). Next: `/match`, `/groups`, `/groups/:id` UI, then the Scene 2 E2E.

- 2026-10-24 16:25 CDT · landed: progress file; 01 scaffold + 02 migration copies; 0300/0301 migrations (RLS, guards, service functions) with 18 integration tests; seed contribution (groups, 6 connections, a block) with 3 tests; compatibility scorer with 34 unit tests. Next: matches service + `GET /api/matches`, then connections, block and report routes.
