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

### 8. Two prompt ids promised a fixture that was never written

`matching.explain_match` and `events.reconnect_followup` sat in the registry with no definition, no
fixture and no caller — 03 and 06 ask 02 for explanations and follow-ups. Removed.

## What was checked and is sound

- **The consent boundary holds.** No feature outside `src/features/agent/` reads 02's tables
  directly, and all six cross-user paths — matching, group planning, venue requests, event
  recommendations, follow-ups, demand — go through `getSharablePreferences*` with a purpose.
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
| `pnpm test` (unit) | 1019 passed |
| `pnpm test:integration` (integration + db) | 259 passed |
| `pnpm test:e2e` (Playwright, bundled Chromium) | 87 passed |
| `tests/audit/core-flows-chrome.ts` (real Chrome) | 8/8 steps |

## Still open

### Profile import is built, but not integrated

`specs/07-profile-import/specs.md` is on this branch; none of the implementation is. The work lives
on `ws/07-import` — around twenty commits covering the API routes, the Web Worker that reads an
Instagram export in the browser, the review and settings screens, the onboarding step and tests —
and is on neither `main` nor the integration branch, so none of it runs in the app audited here.

A trial merge produces seven ordinary textual conflicts (`README.md`, `playwright.config.ts`,
`src/lib/ai/{generate-structured,index}.ts`, `src/lib/ai/prompts/index.ts`,
`src/features/agent/components/onboarding-flow.tsx`, and add/add on the spec). Nothing
architectural. Two notes for whoever merges it:

- That branch ships fixtures for all three of its prompts, so `tests/unit/ai/prompt-registry.test.ts`
  will accept them.
- It still carries the two dead prompt ids removed here. Keep this branch's removal.

### Smaller things

- `src/features/core/components/PlaceholderPage.tsx` has no callers.
- Migrations `0701` and `0702` landed in the `0700–0799` range that
  `specs/07-connection-graph/specs.md` claims for workstream 07. Nothing is broken — they apply
  fine beside `0700` — but the range is no longer exclusive.
- The seed is not concurrency-safe: two seeds at once fail on a foreign key against
  `user_preferences`. It only bites when something reseeds while the e2e suite is running, which is
  what three "failures" in an intermediate run turned out to be.
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
