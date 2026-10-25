# Seed scale, semantic matching, and the business planning copilot

Date: 2026-10-25
Status: approved (design), A in implementation

## Problem

Three defects, one root cause between them.

1. **The business side has nothing to suggest.** 21 profiles, 15 preference rows, 0 demand
   clusters, 0 proposals. Diagnosis: *density, not consent and not hardcoded data.* 14 users do
   consent to demand aggregation, but spread over 8 categories x 9 availability slots x
   geography they never form a 4-person cohort inside one venue's 3km radius, so
   `MIN_COHORT_SIZE=4` is never met and the pipeline emits nothing.
2. **Matching is lexical, not conceptual.** `weightedJaccard` over normalized kebab tags scores
   `pottery` against `ceramics` as 0, and `board-games` against `tabletop-gaming` as 0.
3. **No profit reasoning exists.** The schema has `min_price_cents`, `max_price_cents`,
   `capacity` and RSVP counts, so revenue is derivable, but there is no cost data anywhere:
   no cost per head, no fixed cost, no margin. Profit is uncomputable. Nothing assists the
   owner after a proposal is approved.

## Guiding principle

**AI proposes and narrates; TypeScript computes.** Every number behind a profit claim or a match
score is produced by deterministic, unit-tested code. Muse supplies assumptions, prose and
classifications, never arithmetic. This extends the posture already in `demand.generate_proposal`
("never assert", `assumptionsToValidate`) to economics.

## A. Seed at scale

### Approach

Random data cannot fix defect 1: the bucket space is too sparse for cohorts to form by chance.
The generator **plants** cohorts and the planting is the thing under test.

| Module | Responsibility |
|---|---|
| `supabase/seed/generate/rng.ts` | `mulberry32` seeded PRNG; fixed seed means byte-identical output per run |
| `supabase/seed/generate/cohorts.ts` | A cohort is `(category, slot, neighbourhood centroid, interest cluster, size 5-12)`. Emits enough cohorts that every venue has >= 1 qualifying cluster in radius |
| `supabase/seed/generate/personas.ts` | Cohorts -> profile, preference and agent-profile rows |
| `supabase/seed/generate/bios.ts` | Bio prose. Phrase bank now; Muse-written and cached to a committed fixture when B lands and bio text starts feeding embeddings |
| `supabase/seed/loaders/generated.ts` | The `ExtraLoader` that writes all of it to Supabase |

### Volume

~300 profiles and preference rows, 6 neighbourhoods, 12 businesses, ~60 events (past / live /
future), ~1200 RSVPs, 12 groups, ~400 connections, and `event_feedback` on past events so C's
post-event review has real input.

### Constraints that shape it

- **Consent must be explicit.** `DEFAULT_CONSENT` is all-`false`, and demand aggregation only
  counts opted-in users. Generated personas set `allow_matching` and
  `allow_demand_aggregation` true for the large majority, with a deliberate opted-out minority
  so the consent boundary stays exercised.
- **Existing seed data is load-bearing for tests.** e2e specs assert on named rows
  ("Mission Makers", specific events) and on the demo accounts. Generated rows are therefore
  **additive**, under a distinct UUID prefix that cannot collide, and the fixture-driven demo
  accounts stay byte-identical. Scenes 1-6 must pass untouched.
- **Profiles require auth users.** `profiles.id` references `auth.users(id)` and the row is
  created by a signup trigger, so each persona needs an `auth.admin.createUser` call. 300
  sequential Admin API calls (each bcrypt-hashing a password) is too slow, so creation runs in
  bounded concurrent batches. `deleteSeedUsers` already cleans up anything under
  `@weave.test`, so personas use that domain and reseeding stays idempotent.
- **Scale is opt-out.** `SEED_SCALE` (default 300) controls volume; e2e and CI set `0` so test
  runtime does not regress.

### Acceptance criteria

Not "the seeder runs clean" but, demonstrated against a live local Supabase:

1. Row counts in Postgres match the target volume.
2. `demand_clusters` is non-empty and at least one cluster reaches `MIN_COHORT_SIZE`.
3. The opportunity pipeline produces at least one `event_proposals` row.
4. `/business/insights` renders non-empty bands.
5. The existing unit, integration and e2e suites still pass.

## B. Semantic matching

Muse has no embeddings endpoint (`/v1/embeddings` -> 404), so embeddings are produced locally.
pgvector 0.8.2 is available in the local stack.

- **Migration `0700_embeddings.sql`** — `create extension vector`;
  `interest_embeddings(tag pk, embedding vector(384))` (a few hundred shared rows) and
  `profile_embeddings(user_id pk, embedding vector(384), source_hash text)`; HNSW index with
  `vector_cosine_ops`; service-role-only RLS, since a derived embedding is PII.
- **`src/lib/embeddings/`** — `model.ts` (lazy singleton `@huggingface/transformers` gte-small
  pipeline, 384 dims), `text.ts` (deterministic embedding-text builder, hashed into
  `source_hash` so reseeds skip unchanged rows), `store.ts` (upsert / read).
- **Scoring** — rather than rebalancing all five weights, the `interests` component becomes
  `0.6 * jaccard + 0.4 * cosine`. Weights still sum to 1, a perfect pair still scores 100, and
  the change stays contained to one component.
- **Explainability** — the real risk of vector matching is that a cosine score is not a human
  reason, and this app *enforces* readable reasons: `groundHighlights` drops any highlight not
  present verbatim in the input, and ws03 rejects a match explanation citing an interest only
  one side holds. Tag-level embeddings solve it: when semantic similarity drives a match with no
  exact tag shared, the highlight becomes the **nearest concept pair** (`ceramics` ↔ `pottery`)
  — real values from both profiles. No user is ever shown a cosine score.
- **Fallback** — if embeddings are unavailable the scorer degrades to pure Jaccard and logs a
  warning. Matching never hard-fails on a missing vector.

## C. Business planning copilot

Full event lifecycle.

- **Migration `0701_business_economics.sql`** —
  `business_economics(business_id pk, cost_per_head_cents, fixed_cost_cents, target_margin_pct,
  confirmed_at, confirmed_by)`, written only on owner confirmation, plus
  `event_plans(event_id, stage, plan jsonb)`. Owner-only RLS.
- **`src/features/business/server/economics.ts`** — pure and deterministic:
  `breakEvenHeadcount`, `projectedRevenue`, `marginAtPrice`, `sellThrough`, `paceStatus`. These
  carry the highest-value tests in the spec.
- **Cost inputs** — Muse drafts a cost model as explicit assumptions surfaced through the
  existing `assumptionsToValidate` pattern; the owner edits inline and confirms; confirmed values
  persist and prefill next time. The AI never silently asserts a cost.

| Stage | Prompt | Grounded in |
|---|---|---|
| Extract | `business.extract_economics` | category, price range, equipment tags |
| Pre-launch | `business.plan_prelaunch` | demand band + confirmed economics -> plan and profit model at 3 price points |
| Fill | `business.coach_fill` | RSVP pace vs break-even -> concrete interventions |
| Day-of | `business.run_sheet` | confirmed headcount + `equipment_tags` |
| Review | `business.post_review` | actuals vs plan + `event_feedback` |

**UI** — profit panel with editable assumptions on `/business/proposals/[id]`; pacing panel and
run sheet on `/business/events/[id]`; new `/business/events/[id]/review`. `/business/insights`
needs no change; A alone populates it.

## Error handling

- Embeddings unavailable -> pure Jaccard, warning logged, matching still works.
- Muse unavailable -> `AI_UNAVAILABLE`; economics still render from confirmed assumptions.
- No confirmed economics -> the profit panel shows a "needs your input" state. An unconfirmed
  number is never displayed as fact.

## Testing

- **A** — unit tests asserting cohort planting yields >= N qualifying clusters; an integration
  test that the pipeline emits >= 1 proposal per venue.
- **B** — determinism tests on the embedding-text builder; nearest-pair tests; blended-scoring
  and weights-sum invariants; a `db` test asserting pgvector cosine ordering. The model is
  mocked in unit tests.
- **C** — exhaustive unit tests on every economics function; e2e for proposal -> profit ->
  approve.
- Every new prompt ships a `MOCK_AI=1` fixture so CI stays offline and free.

## Risks

1. **Rebalancing the interests component changes existing match scores.** ws03 tests asserting
   specific values will need updating. Unavoidable.
2. **Embedding 300 profiles on reseed is slow.** Mitigated by batching and `source_hash`.
3. **AI surface area grows sharply.** `/discover` already fires up to 10 explanation calls per
   load; C adds five prompts. Real token cost; worth a budget guard.
4. **C is large.** If it slips, the cut line is pre-launch + fill first, deferring run sheet and
   post-event review.

## Sequencing

A unblocks everything and lands first. B and C are independent of each other.
