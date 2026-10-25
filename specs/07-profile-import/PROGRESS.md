# Workstream 07 — Progress

Branch: `ws/07-import`. Source of truth: the ws07 goal prompt (screenshots first) and [`specs.md`](./specs.md), which is being updated to match. UI copy: "Bring in your Instagram taste", never "Connect Instagram".

## Phase 1: screenshots → reviewed traits

- [x] `generateStructured` images option (additive, retries resend images) + unit tests
- [x] Prompts `import.read_screens` (smart), `import.map_labels` (fast), `import.plan` (smart) + MOCK_AI fixtures
- [x] Vocabulary (~150 tags, all seed tags, 8 activity styles) and sensitive deny-list (filtered after the model on the server)
- [x] Deterministic confidence (`weights.ts`), banding, dedupe vs profile / pending / not-me, 25 per run
- [x] Mapping validator: cites input ids, closed list only, sensitive dropped
- [x] Image validation: 1–4 files, magic bytes, ≤ 1.5 MB each, ≤ 4 MB total; client resize ≤ 1568 px, JPEG 0.85
- [x] Migration `0700_import.sql` (owner-only RLS, no business policy, atomic `import_decide`) + generated types
- [x] `POST /api/import/screens`, `GET /api/import/suggestions`, `POST /api/import/suggestions/decide` (all-or-nothing, `CONFLICT`)
- [x] 02 `addConfirmedTraits` (union via applyPatch/repo, categories, 50 cap, ai_inferred kept before review, counts-only log); 03 `invalidateMatches` after saving
- [x] `/agent/import`: what to share, how-to, preview, Send, review cards (Love it / Yes / Edit / Not me; Less of this: Keep as a dislike / Ignore), aria-live counter, Done for now
- [x] Onboarding optional step (Skip first) and link from `/agent/preferences`
- [x] `IMPORT_ENABLED` + `is_adult_confirmed` gate
- [x] CI: lint/typecheck/unit, migrations/types/integration (incl. 07's DB tests) and Scene 1b + Skip e2e green; green except 05's intermittent Scene 4 (see Blocked)

## Phase 2: the plan

- [x] `GET /api/import/plan` from existing contracts only (getSuggestedPeople, getRecommendedEvents, getNearbyBusinesses, listMyGroups); dislikes dropped, loved first
- [x] `import.plan` with refs only; code validator; no-AI fallback; stored in `import_plans`
- [x] "Your plan" on `/agent/import` and a card on `/discover`; step links deep-link; done state from connections/RSVPs or a manual Done (`POST /api/import/plan/done`)

## Phase 3

- [x] `/agent/import/settings` with "Delete my Instagram data" (Keep / Remove, no default) via `GET/DELETE /api/import/data`
- [x] Download-your-information JSON in a Web Worker → `POST /api/import/export` (strict labels only) → same pipeline from mapping

## Tests

- [x] Unit: alias mapping, sensitive table, validator (off-list, unknown id, injection), confidence golden values and band edges, dedupe, decide planning, image validator, generateStructured image blocks, addConfirmedTraits rules
- [x] Integration (written; runs in CI): decide union + provenance, not_me suppresses re-import, pending changes nothing in 02/03/04/06, CONFLICT, expiry, RLS owner/other/business, no image bytes in logs or rows
- [x] E2E (written; runs in CI): Scene 1b, Skip leaves onboarding unchanged
- [x] Plan validator, ranking and prompt-input unit tests; export extraction and schema tests
- [x] Integration: plan build + manual done; delete keep / remove

## Decisions

Edits outside `src/features/import`, the import routes/pages, `supabase/migrations/07xx` and `specs/07-*`, one commit each:

- `src/lib/log.ts`: `images` and `imagedata` (matches `imageData`, keys are compared lowercase) added to `REDACTED_KEYS` so screenshot bytes can never reach logs.
- `src/lib/ai/{generate-structured,types,index}.ts`: optional `images` on `generateStructured`; the user message becomes image blocks then the JSON text block; retries resend them; MOCK_AI unchanged.
- `src/lib/ai/prompts/{import,index}.ts` and three fixtures: 07's prompts in their own file, the same pattern as the other workstreams.
- `.env.example`, `README.md`: `IMPORT_ENABLED` (1 locally, 0 in production until signed off). `playwright.config.ts`: `IMPORT_ENABLED: '1'` on the test server so Scene 1b runs in CI (the workflow file cannot be edited from this machine: no `workflow` token scope).
- `src/lib/supabase/database.types.ts`: 07's tables and `import_decide` added. This machine has no Docker, so they were written in the generator's exact format; CI's "Generated types are committed and current" check passed on the first push.
- `src/features/agent/{index.ts,server/confirmed-traits.ts}`: `addConfirmedTraits(userId, { interests?, activityPrefs? })`, implemented with 02's own `applyPatch` and repo.
- `src/features/agent/components/onboarding-flow.tsx`, `src/app/(auth)/onboarding/page.tsx`: optional import step. It is opened from Talk with a "Bring in your Instagram taste" button rather than inserted automatically, so "Review my profile" and "Fill in a form instead" still go straight to Review and 02's Scene 1 and AI-fallback e2e tests pass unchanged. The step itself has Skip first.
- `src/app/(consumer)/agent/preferences/page.tsx`: link to `/agent/import` when the feature is available.
- `src/features/agent/index.ts`: `getOwnPreferencesForImport` (02's privacy guard forbids other features from reading `user_preferences`) and `removeImportedTraits` (Delete → Remove), both in `server/confirmed-traits.ts` on 02's own rules.
- `src/features/events/index.ts`: re-export `getNearbyBusinesses` for the plan.
- `src/app/(consumer)/discover/page.tsx`: the "Your plan" card, rendered only when 07 is available to the viewer.

Other decisions:

- 2026-10-25: Screenshots are the MVP and the export is Phase 3 (the goal prompt supersedes specs.md, which still describes export-first; to be rewritten).
- 2026-10-25: Decisions are atomic in one SQL function (`import_decide`, service role only). If the preference write fails after the decision commits (a DB error between two calls), the suggestions stay decided.
- 2026-10-25: "Less of this" cards are `trait_suggestions` rows with `field = 'dislike'`; Keep stores a `taste_dislikes` row (`see_less`), Ignore stores nothing. "Not me" stores a `not_me` dislike, which also suppresses re-suggestion.
- 2026-10-25: Evidence is cleared when a suggestion is decided (keep the decision, not the reason).
- 2026-10-25: Current preferences come from a second small 02 export, `getOwnPreferencesForImport(userId)` (spec 07 §20 item 3): 02's privacy guard forbids any other feature from querying `user_preferences`, so the direct RLS read was replaced. The 50-interest cap is checked with it before the atomic decision write.
- 2026-10-25: A summary mention only strengthens a tag that a topic or tile already showed; it never creates a suggestion on its own.
- 2026-10-25: Before onboarding is reviewed, an imported value lands in a field 02 marks `ai_inferred`, so on Review it shows 02's per-field "AI inferred" marker like the chat's values. field_sources is per field by design (goal prompt); per-value marking is a request to 02 below.

- 2026-10-25: The export path accepts the extracted `.json` files, not the `.zip`, to avoid a new unzip dependency; the how-to says to unzip first. Ad interests weigh 0.35 (`W_AD_INTEREST`), below a topic's 0.6.
- 2026-10-25: Delete my Instagram data removes every 07 row including provenance; Keep leaves the values as the user's own, Remove takes them out through 02.
- 2026-10-25: Plan steps for places link to `/places` (no per-place page exists); `create_group` fits place refs and links to `/groups`.

## Needs from others

- 02: on Review and in the preference editor, don't show the per-field "AI inferred" marker on values that have a `trait_provenance` row (the user explicitly approved them). 07 can export `getImportProvenance(userId)` for this.
- Integrator: README workstream table, migration range 0700–0799, privacy invariant "imported data and pending suggestions never leave features/import", and the routes table (spec 07 §20); `.github/workflows/ci.yml` could set `IMPORT_ENABLED: '1'` in its env instead of `playwright.config.ts`.

## Blocked

- No Docker on this machine: integration and e2e run only in CI (push to `ws/07-import`). Local runs: typecheck, lint, unit, build.
- 05's `scene4-business.spec.ts` (reject / revise): still intermittent after 3937ef8 (failed again on 6b90397); main's 5e938bc/bb61bcd target it and are merged. Not caused by 07; owner 05.

## Log

- 2026-10-25 08:05 — Scene 4 flaked again on 6b90397 (63 passed, all 07 green). Merged main 5e938bc + bb61bcd (05's navigation fixes). Next: CI on the merge.
- 2026-10-25 07:45 — Merged main (3937ef8, 05's decision-date fix). CI on a0987cd fully green: lint/typecheck/unit, migrations/types/integration, all e2e incl. Scene 1b. Phases 1–3 done. Next: watch main, idle list.
- 2026-10-25 07:20 — Fixed screenshot previews breaking when a second image is added (+ e2e). CI 9e20f66: unit, integration and 64 e2e green incl. all 07 specs; only 05's Scene 4 reject test fails (known, see Blocked). Next: watch main.
- 2026-10-25 06:45 — Phase 3 pushed (settings + delete, export Web Worker); mocked unit tests for run/decide/plan/flag bring unit-only coverage on import/server to 82.6% (repo/settings covered by integration). 891 unit green. Next: watch CI and main; polish empty/error states.
- 2026-10-25 06:30 — Phase 2 (plan) and Phase 3 (settings + delete, export via Web Worker) landed locally; CI on the Phase 2 head: lint/typecheck/unit and migrations/types/integration green, e2e running. 882 unit green; build green. Next: CI result, coverage on import/server.
- 2026-10-25 05:40 — Phase 1 code complete: migration + types (CI-verified), pipeline core, routes, review UI, onboarding step, 02 addConfirmedTraits; unit 50+ green locally; integration and Scene 1b e2e pushed for CI. Next: CI results, then Phase 2 plan.
