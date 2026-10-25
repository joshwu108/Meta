# Repository audit — 2026-10-25

Branch `ws/07-full-audit`, taken from `ws/integrate-all`. The brief was to test the repository end
to end, check the functionality is actually built rather than stubbed, look for hardcoded parts,
and stress the three features the product is judged on: agents talking to agents, generating events
from the data we collect, and importing social profiles.

Everything below was reproduced before it was changed, and the tests named are in the repository.

## What was wrong, and is now fixed

### 1. Workstream 06 was talking to a fake agent

`src/features/events/server/stubs/agent.ts` held stand-ins written while 02 was unmerged. 02 has
been on main for some time, and `./social.ts` and `./core.ts` were switched to re-export the real
thing when 03 and 01 landed — `./agent.ts` never was. 06's own suites run against a pglite stand-in
schema, so nothing compared the stand-ins with the boundary they stand in for. Four had drifted
into fiction:

| Function | What it did | What that cost |
|---|---|---|
| `getConsent` | returned every flag `false` | an RSVP that omitted its sharing choices ignored what the member had actually consented to |
| `getAttendeeSharing` | returned an empty map | no attendee's interests ever appeared on an attendee list, consent or not |
| `explainRecommendation` | returned a template | event recommendations never carried the agent's explanation, though match cards did |
| `suggestFollowUp` | always proposed coffee, category `food_drink` | every post-event reconnection in the product said the same thing |

All four now re-export `@/features/agent`. `tests/integration/events/agent-contract.test.ts` holds
them to the real boundary and failed on all five counts before the change.

### 2. The events filter had duplicate DOM ids

`/events` renders `EventFilters` twice — once in the right rail, once below the feed — and CSS
hides whichever does not belong at that width. Both copies used the same field ids. Duplicate ids
are invalid HTML, and `<label for>` binds to the first match in document order, so the *visible*
select had no accessible name at all. Each instance now carries its own ids.

### 3. Three e2e specs signed in with accounts that no longer exist

`@commonground.test` logins came back in with a branch merged after the rename. They now use
`@weave.test`.

### 4. Three e2e specs passed exactly once per dataset

`scene5`, `scene6` and `events-actions` mutate state and never reseeded, so they passed on a fresh
database and failed on every rerun. scene6 ends with a pair accepted on both sides, so its Accept
button is gone the second time through. They reseed now.

### 5. The integration suite was asserting against a dataset that had outgrown it

Several suites call `runSeedWith` directly and then resolve users with a single
`listUsers({ perPage: 200 })`. Once the generated cohort landed, the seed produced 319 people and
that call silently truncated, so `ids.get('maya')` came back undefined and the assertions compared
against `undefined`. Seven failures across four files traced to this. The integration project now
pins `SEED_SCALE=0`, the same thing `playwright.config.ts` does and for the same reason: those
suites assert on the hand-written fixtures. `full-seed-stress` asks for the cohort explicitly and
puts the dataset back afterwards.

### 6. 06's database suite never exercised the AI path

The stand-ins never called a model, so `tests/db` ran without `MOCK_AI` and nobody noticed. Making
06 talk to the real agent surfaced it immediately: `No AI credential configured`. That project now
sets `MOCK_AI=1` like the others, and two assertions that pinned the stand-ins' literal output —
a hardcoded "Coffee catch-up" title and a templated explanation — now assert the behaviour they
describe: a title without a slot phrase in it, an explanation grounded in the viewer's
preferences, and a follow-up slot that both people actually share.

### 7. A venue test still encoded pre-0701 semantics

`0701_venue_capacity_floor.sql` deliberately made venue capacity a ranking input rather than an
exclusion, because a cohort is the number of people interested, not the number who will attend.
`business-rls.test.ts` still asserted that a 400-person cohort returns no venues. The test now
asserts the intent that replaced it, and still checks that distance excludes.

### 8. Withdrawing consent did not reach the caches above it

`getSharablePreferences` is the gate for every cross-user read, but match lists are cached per
viewer for five minutes and graph snapshots for a minute, and both sit *above* that gate.
`PATCH /api/agent/permissions` invalidated neither, so a member who turned off `allow_matching`
stayed on other people's match lists — name, and an explanation derived from the preferences they
had just withdrawn — until the entry expired. Invalidating their own entry cannot help: the cache
is keyed by who is looking, not by who is in the list. The route now clears both caches when a
patch touches one of the three `allow_*` flags; consent changes are rare and the caches are
optimisations, so clearing is cheap and certainly right.
`tests/integration/social/consent-revocation.test.ts` covers it.

### 9. Blocking someone did not reach the graph

The same shape as the one above, on the strongest safety action in the product. `blockUser` drops
both people's cached match lists but nothing dropped their graph snapshots, so each stayed in the
other's graph — name, avatar, and the edge describing how they knew each other — until the entry
expired. The graph's read side cannot be imported from `matching` without a cycle, so the route
drops the pair's snapshots, the same place `/api/me` and `/api/agent/permissions` do their
invalidation. `tests/integration/social/block-propagation.test.ts` covers it, and also checks the
block lands in both directions and leaves everyone else alone.

### 10. Accepting a follow-up did nothing visible, on a production build only

Chasing that "flake" into production mode turned up a real bug the dev server had been hiding.
Accepting an agent's follow-up suggestion sent the PATCH, the server recorded it, and the card then
sat with both buttons disabled until the member reloaded the page by hand. `router.refresh()`
re-fetches the page, but on a production build the refreshed payload never reached this card;
`next dev` re-renders on every request, so it looked fine there. Deterministic once run the right
way: three of three in production, three of three green after the fix.

The card renders from the status the PATCH already returns, and the refresh is a background sync
rather than the thing the UI waits on. The e2e test that caught it had been passing in dev, which
is the real lesson — a suite run in the wrong mode can be green and still be wrong.

Checked afterwards whether the shape was systemic, since three cache bugs had been. It is not.
`router.refresh()` works on a build: RSVP updates in place (measured — the cancel control appears
and the RSVP button goes, with no reload), and the reconfirm and complete-event buttons are
covered by `events-actions.spec.ts`, which passes in production mode. Two other workstreams had
already worked around the same thing in `DecisionPanel.tsx` ("a real load, not router.refresh()")
and `use-submit.ts`, so the follow-up card was the third occurrence and the last one left.

### 11. Losing group membership did not reach the graph either

Third instance of the same class, and the mildest: a group puts its roster in each member's graph
snapshot, and neither leaving a group nor being removed from one dropped that snapshot, so a
former member kept seeing the group and its members for up to a minute. The data was legitimately
theirs a moment earlier, so this is staleness rather than a new disclosure — but for a private
group the roster is exactly what membership gates. Both routes now invalidate.
`tests/integration/graph/membership-invalidation.test.ts` covers it.

**The pattern worth remembering:** per-viewer caches sit above the privacy gates, and every
mutation that changes who may see whom has to reach them. Invalidating the *subject's* own entry is
never enough, because entries are keyed by the viewer. Three surfaces have needed this so far —
consent, blocks, group membership — and a fourth cached read surface will need it too.

### 12. Two prompt ids promised a fixture that was never written

`matching.explain_match` and `events.reconnect_followup` sat in the registry with no definition, no
fixture and no caller — 03 and 06 ask 02 for explanations and follow-ups. Removed.

## What was checked and is sound

- **The consent boundary holds.** No feature outside `src/features/agent/` reads 02's tables
  directly, and all six cross-user paths — matching, group planning, venue requests, event
  recommendations, follow-ups, demand — go through `getSharablePreferences*` with a purpose.
- **Two migrations can no longer share a version.** Supabase keys `schema_migrations` on the
  leading digits, so a clash stops `supabase db reset` partway and leaves the database half-built.
  That happened once here when 07's graph and import migrations both arrived as `0700`, and it
  will happen again — each workstream picks numbers on its own branch and nothing notices until
  the branches meet. A unit test now catches it in seconds instead.
- **"Delete my Instagram data" empties everything, and will keep doing so.** 07's own integration
  test already asserted zero rows left rather than trusting the counts the call reports, which is
  the right way round. The one weakness was that the list of tables lived in two places by hand, so
  a sixth table could be missed in both and survive a deletion request. The deletion now exports
  `IMPORT_TABLES` and the test holds it against the tables `0703_import.sql` actually creates.
  Checked that the guardrail fails when a table is dropped from the list.
- **The loop the product is built on joins up.** `tests/integration/demand/demand-to-feed.test.ts`
  walks it in one test: demand people expressed becomes a cluster, the cluster becomes a proposal,
  a venue approves and publishes it through its own routes, and the event comes back to one of the
  very people whose demand produced it — with an explanation, not just a listing. Every hop had a
  suite; nothing checked that the chain joins up, which is the claim on the front of the README and
  the one that breaks quietly when two workstreams each stay correct.
- **Event generation works on the real dataset.** `tests/integration/demand/full-seed-stress.test.ts`
  runs the pipeline over the whole demo seed and holds it to the cohort threshold, the cluster a
  proposal came from, venue capability, venue lead time, one proposal per cluster and venue,
  arriving as `pending`, and no double-proposing on a second run. `usersConsidered` must equal the
  consenting population exactly in both directions: fewer means demand is silently dropped, more
  means the consent gate let somebody through who never agreed to be counted.
- **Every Route Handler is guarded.** `tests/unit/api/route-guards.test.ts` enforces it; the public
  list is explicit and each entry states why.
- **No hardcoded ids, hosts or seeded names in product code.** Demo names appear only in the dev
  theme gallery. `MOCK_AI` is opt-in; the dev seed route refuses outside dev or `DEMO_MODE`.
- **`nextSlotStart` is sound** across 270,000 combinations of date, slot, time and lead time. It
  threw earlier in the day; workstream 04 fixed it in `4fb20f6` and this branch picked that up.
- **The product works in real Chrome.** `tests/audit/core-flows-chrome.ts` walks sign-in, a match
  card with the agent's explanation, the graph, a reply from the agent in chat, the published feed
  and a venue owner's proposal inbox. 8/8.

## Where the suites stand

| Suite | Result |
|---|---|
| `pnpm test` (unit) | 1099 passed |
| `pnpm test:integration` (integration + db) | 291 passed |
| `pnpm test:e2e:prod` (Playwright, production build) | 90 passed in 2.9 min |
| `tests/audit/core-flows-chrome.ts` (real Chrome) | 8/8 steps |

## Still open

### Profile import: merged here, with three things the merge needed

`ws/07-import` is now merged into this branch, so the feature runs and is tested. Three things the
merge needed, which whoever lands this on `main` should know about:

**The migration number collided** (now guarded by `tests/unit/migrations/numbering.test.ts`). Both `0700_graph_edge_events.sql` and `0700_import.sql` claim
version `0700`, and Supabase keys `schema_migrations` on that number, so `supabase db reset` fails
outright with a duplicate key — not a warning, a hard stop. The import migration is renumbered to
`0703` here, since the graph one is already on the main line and this one had not merged anywhere.

**The vision support needed porting.** 07 added images to `generateStructured` against the raw
Anthropic client; `main` has since moved to a provider abstraction (`resolveProvider`, with Llama
and Muse behind an OpenAI-compatible transport), whose `AiMessage.content` was text-only. Images
now travel as content parts: `AiContentPart` carries text or a base64 image, the Anthropic provider
maps parts to its own blocks, and the OpenAI-compatible providers refuse a message carrying images
with a clear `AI_UNAVAILABLE` rather than silently dropping the pictures and answering from the
text alone. That keeps 07's actual capability — it was Anthropic-only — without inventing a vision
mapping for Llama or Muse, which is their owners' call.

**One real bug, found by their own e2e test.** Choosing two screenshots in quick succession kept
only the second. `pick()` is async because preparing an image resizes it, so two picks both resume
after their await having read the list from the closure as it was before either started, and the
second overwrite the first. Measured directly: back-to-back picks produced 1 preview, the same two
picks 1200 ms apart produced 2. It appends through the existing `live` ref now, and both cases
produce 2. A person hitting this would watch a screenshot they just chose silently disappear.

The merge also kept this branch's removal of the two dead prompt ids while taking 07's three new
ones, which `tests/unit/ai/prompt-registry.test.ts` then held to the fixture contract — the
guardrail doing its job on a merge it was written before.

### Smaller things

- `src/features/core/components/PlaceholderPage.tsx` has no callers.
- Migrations `0701` and `0702` landed in the `0700–0799` range that
  `specs/07-connection-graph/specs.md` claims for workstream 07. Nothing is broken — they apply
  fine beside `0700` — but the range is no longer exclusive.
- The seed is not concurrency-safe: two seeds at once fail on a foreign key against
  `user_preferences`. It only bites when something reseeds while the e2e suite is running, which is
  what three "failures" in an intermediate run turned out to be.
- **A dev-mode e2e pass now says so.** `tests/e2e/global-setup.ts` prints one line when the run
  is against `next dev`, because the knowledge that such a run is not authoritative lived only in
  a comment in `playwright.config.ts` — which is not where someone typing `pnpm test:e2e` looks.
- **Run the e2e suite the way CI does.** `pnpm test:e2e` uses `next dev`, which compiles routes on
  demand: tests run 2.2× slower by the end of a full pass (3.8s average over the first twenty,
  8.4s over the last ten), which is enough to trip five-second expect timeouts in whichever spec
  happens to be late. That is what the "moving flake" was — a different spec failing each run,
  every one passing alone. `pnpm test:e2e:prod` serves a production build: 90 passed in 2.9
  minutes against 8.7, and no failures.
- Chrome writes a `style` attribute onto form fields before React hydrates, which React reports as
  a hydration mismatch on an input our markup never styles. Bundled Chromium is clean across every
  spec, so this is the browser editing the page rather than our HTML disagreeing with itself. The
  Chrome walk collects it separately instead of failing on it.

## Running it

```bash
pnpm test                 # unit
pnpm test:integration     # integration + db, against the local stack
pnpm test:e2e             # Playwright, bundled Chromium
pnpm dev -p 3100 &        # then, in real Google Chrome:
pnpm tsx tests/audit/core-flows-chrome.ts
```

Do not reseed while the e2e suite is running; both own the same database.
