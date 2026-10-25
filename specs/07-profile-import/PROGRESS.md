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
- [ ] CI green on the branch (integration + Scene 1b e2e)

## Phase 2: the plan

- [ ] `GET /api/import/plan` from existing contracts only (getSuggestedPeople, getRecommendedEvents, getNearbyBusinesses, listMyGroups)
- [ ] `import.plan` with refs only; code validator; no-AI fallback; stored in `import_plans`
- [ ] "Your plan" on `/agent/import` and a card on `/discover`; step buttons deep-link; done state from real data

## Phase 3

- [ ] `/agent/import/settings` with "Delete my Instagram data" (Keep / Remove, no default)
- [ ] Download-your-information JSON in a Web Worker → same pipeline from mapping

## Tests

- [x] Unit: alias mapping, sensitive table, validator (off-list, unknown id, injection), confidence golden values and band edges, dedupe, decide planning, image validator, generateStructured image blocks, addConfirmedTraits rules
- [x] Integration (written; runs in CI): decide union + provenance, not_me suppresses re-import, pending changes nothing in 02/03/04/06, CONFLICT, expiry, RLS owner/other/business, no image bytes in logs or rows
- [x] E2E (written; runs in CI): Scene 1b, Skip leaves onboarding unchanged
- [ ] Plan validator unit tests (Phase 2)

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

Other decisions:

- 2026-10-25: Screenshots are the MVP and the export is Phase 3 (the goal prompt supersedes specs.md, which still describes export-first; to be rewritten).
- 2026-10-25: Decisions are atomic in one SQL function (`import_decide`, service role only). If the preference write fails after the decision commits (a DB error between two calls), the suggestions stay decided.
- 2026-10-25: "Less of this" cards are `trait_suggestions` rows with `field = 'dislike'`; Keep stores a `taste_dislikes` row (`see_less`), Ignore stores nothing. "Not me" stores a `not_me` dislike, which also suppresses re-suggestion.
- 2026-10-25: Evidence is cleared when a suggestion is decided (keep the decision, not the reason).
- 2026-10-25: Current preferences come from a second small 02 export, `getOwnPreferencesForImport(userId)` (spec 07 §20 item 3): 02's privacy guard forbids any other feature from querying `user_preferences`, so the direct RLS read was replaced. The 50-interest cap is checked with it before the atomic decision write.
- 2026-10-25: A summary mention only strengthens a tag that a topic or tile already showed; it never creates a suggestion on its own.
- 2026-10-25: Before onboarding is reviewed, an imported value lands in a field 02 marks `ai_inferred`, so on Review it shows 02's per-field "AI inferred" marker like the chat's values. field_sources is per field by design (goal prompt); per-value marking is a request to 02 below.

## Needs from others

- 02: on Review and in the preference editor, don't show the per-field "AI inferred" marker on values that have a `trait_provenance` row (the user explicitly approved them). 07 can export `getImportProvenance(userId)` for this.
- Integrator: README workstream table, migration range 0700–0799, privacy invariant "imported data and pending suggestions never leave features/import", and the routes table (spec 07 §20); `.github/workflows/ci.yml` could set `IMPORT_ENABLED: '1'` in its env instead of `playwright.config.ts`.

## Blocked

- No Docker on this machine: integration and e2e run only in CI (push to `ws/07-import`). Local runs: typecheck, lint, unit, build.

## Log

- 2026-10-25 05:40 — Phase 1 code complete: migration + types (CI-verified), pipeline core, routes, review UI, onboarding step, 02 addConfirmedTraits; unit 50+ green locally; integration and Scene 1b e2e pushed for CI. Next: CI results, then Phase 2 plan.
