# Workstream 04 — Community Demand & Event Proposal Engine

**Owner role:** AI / backend engineer (pipeline)
**Depends on:** 01 (admin client, `generateStructured`, `notify`, `logAgentAction`), 02 (`getSharablePreferences(·,'demand')`), 05 (`findCandidateBusinesses`, `businesses` table) — all stubbed until available
**Consumed by:** 05 (reads `event_proposals`), 06 (events created from approved proposals carry `source='ai_proposal'`)
**Read first:** [`../README.md`](../README.md) sections 2–5

---

## 1. Purpose

This is the product's differentiator: instead of waiting for events to exist, the system notices that several nearby people want the same kind of experience at the same time, drafts a concrete, realistic event concept, picks the local business best placed to host it, and delivers the proposal to that business for approval. The engine is a pipeline of deterministic steps with one LLM call in the middle. Privacy thresholds, business constraints, and "never claim anything is confirmed" rules are enforced in code, not in prompts.

## 2. PRD Coverage

EAI-01..EAI-08 (P0), EAI-09..EAI-11 (P1); Section 8.1 components 3, 4, 5; Section 8.4 pipeline; Section 11.5 background processing; Section 12.4 aggregation safety; Workflow A steps 1–5; Demo Scene 3.

## 3. Scope

### In scope (P0)
- `runOpportunityPipeline()` with stages: collect → filter → cluster → threshold → format → match business → generate → validate → store → notify
- `demand_clusters` (business-visible aggregate) and `demand_cluster_members` (service-role only)
- `event_proposals` rows with the full proposal document (section 5.5) and a status machine
- `POST /api/ai/generate-opportunities` manual trigger (operator/demo button) and `GET /api/ai/opportunities/:runId` status
- Operator page `/admin/opportunities` (DEMO_MODE only) with the "Generate Opportunities" button, run log, and resulting proposals
- Cron entry point `GET /api/cron/opportunities` protected by `OPPORTUNITY_CRON_SECRET` (Vercel Cron, daily) — wired but optional for demo
- Dedup: do not create a new pending proposal for the same `(cluster signature, business)` within 14 days

### P1
- Revision: when 05 modifies constraints and asks for a rewrite, `POST /api/ai/proposals/:id/revise` regenerates description/format with the new numbers
- Group-originated proposals: `source: 'group'` input path from 03's planner
- Demand estimate with confidence band shown to business (e.g. "6 people, likely 4–8 attendees")

### Out of scope
- Learning from outcomes, recurring event suggestions, multi-venue events

## 4. Data Model (migrations `0400_demand.sql`)

```sql
create table opportunity_runs (
  id uuid primary key default gen_random_uuid(),
  triggered_by text not null check (triggered_by in ('manual','cron','group')),
  status text not null default 'running' check (status in ('running','completed','failed')),
  stats jsonb not null default '{}',         -- { usersConsidered, clustersFound, clustersSuppressed, proposalsCreated, skippedDuplicate, llmFailures }
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table demand_clusters (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references opportunity_runs(id) on delete cascade,
  signature text not null,                    -- '<category>|<slot>|<geocell>' used for dedup
  category text not null,                     -- EVENT_CATEGORY
  slot text not null,                         -- AVAILABILITY_SLOT
  geocell text not null,                      -- 0.02° lat/lng cell id, e.g. '37.76,-122.42'
  center_lat numeric(6,2) not null,
  center_lng numeric(6,2) not null,
  member_count int not null,                  -- raw count (only stored; business sees banded value)
  top_interests jsonb not null,               -- [{ "tag": "pottery", "count": 4 }] only tags with count >= 2
  group_size_mode text,                       -- GROUP_SIZE_PREF
  budget_p50_cents int,
  activity_prefs jsonb not null default '[]', -- tags with count >= 2
  created_at timestamptz not null default now()
);
create index on demand_clusters (signature, created_at desc);

create table demand_cluster_members (         -- SERVICE ROLE ONLY. Never exposed through any policy or view.
  cluster_id uuid not null references demand_clusters(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  primary key (cluster_id, user_id)
);

create table event_proposals (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references opportunity_runs(id) on delete set null,
  cluster_id uuid references demand_clusters(id) on delete set null,
  source text not null default 'demand' check (source in ('demand','group')),
  source_group_id uuid,                        -- when source = 'group'
  business_id uuid not null,                   -- FK to businesses added once 05's migration exists (0401 or 05xx)
  status text not null default 'pending' check (status in ('pending','approved','modified','rejected','expired')),
  proposal jsonb not null,                     -- ProposalDocument (§5.5), immutable after insert
  business_edits jsonb,                        -- 05 writes the edited fields here
  decided_at timestamptz,
  decision_note text,
  resulting_event_id uuid,                     -- 05 sets after approval
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on event_proposals (business_id, status, created_at desc);

alter table opportunity_runs enable row level security;         -- no policies: service role only
alter table demand_clusters enable row level security;
alter table demand_cluster_members enable row level security;   -- no policies
alter table event_proposals enable row level security;
-- business owners read their own proposals (policy references businesses.owner_id, created by 05; 04 ships it
-- guarded by `do $$ begin if exists (select 1 from pg_tables where tablename='businesses') ...` or 05 adds it in 05xx)
create policy proposals_business_read on event_proposals for select
  using (exists (select 1 from businesses b where b.id = business_id and b.owner_id = auth.uid()));
create policy clusters_business_read on demand_clusters for select
  using (exists (select 1 from event_proposals p join businesses b on b.id = p.business_id where p.cluster_id = demand_clusters.id and b.owner_id = auth.uid()));
```

**Banding rule for anything a business sees:** `member_count` is displayed as a band: 4–5 → "4–5", 6–9 → "6–9", 10–19 → "10+", ≥20 → "20+". Raw counts never cross into 05's responses; the `ProposalDocument` carries `demand.band` only.

## 5. Pipeline (`src/features/demand/server/pipeline.ts`)

Each stage is a pure function over immutable inputs, individually unit-tested. Config in `src/features/demand/server/config.ts`:

```ts
export const DEMAND_CONFIG = {
  minCohortSize: Number(process.env.MIN_COHORT_SIZE ?? 4),
  geocellDegrees: 0.02,
  maxClustersPerRun: 10,
  maxProposalsPerBusinessPerRun: 2,
  duplicateWindowDays: 14,
  minInterestTagCount: 2,
} as const;
```

### 5.1 Collect
Service-role query for `profiles` with `onboarding_completed_at not null` and `is_adult_confirmed`, then `getSharablePreferences(id, 'demand')` for each; drop nulls. Log `{ actor: 'demand_engine', action: 'collect_signals', permissions_used: ['demand'] }` per included user (batched insert).

### 5.2 Filter
Drop users with no `availabilitySlots`, no `interestCategories`, or no coarse coordinates.

### 5.3 Cluster
Deterministic bucketing, no ML: for each user, emit one signal per `(category ∈ interestCategories, slot ∈ availabilitySlots, geocell(coarseLat, coarseLng))`. Group signals by key. Then **radius merge**: adjacent geocells (8-neighborhood) with the same `(category, slot)` are merged if the combined centroid is within each member's `travelRadiusKm`; this lets a Mission user and a Castro user land in one cluster. Users appear in at most one cluster per `(category, slot)`.

### 5.4 Threshold & aggregate
Keep clusters with `memberCount >= minCohortSize`. Compute `top_interests` (tags with count ≥ `minInterestTagCount`), `group_size_mode`, `budget_p50_cents`, `activity_prefs`. Rank clusters by `memberCount × interestFocus` where `interestFocus` = share of members holding the top tag. Keep top `maxClustersPerRun`. Record suppressed count in run stats.

### 5.5 Format the cluster for the model (DemandBrief)
```ts
type DemandBrief = {
  category: EventCategory; slot: AvailabilitySlot; neighborhoodLabel: string;
  demandBand: '4-5' | '6-9' | '10+' | '20+';
  topInterests: { tag: string; count: number }[]; groupSizeMode: GroupSizePref | null;
  budgetP50Cents: number | null; activityPrefs: string[];
};
```
No user ids, names, or exact coordinates.

### 5.6 Match business (`findCandidateBusinesses(criteria)` from 05; stub reads `businesses` directly)
Criteria: category, cohort size, slot, cluster center, radius 3 km, `budgetMax = budget_p50 × 1.5`. Score: category supported (required) + 0.4 × capacity fit (`capacity >= cohort` else reject) + 0.3 × slot in `hosting_slots` + 0.2 × distance + 0.1 × price-preference overlap. Take the best business not already holding a pending proposal for this signature, and not exceeding `maxProposalsPerBusinessPerRun`. If none, mark cluster `unmatched` in stats and skip.

### 5.7 Generate (`demand.generate_proposal`, smart model)
Input: `DemandBrief` + `BusinessPublicCard` + business capabilities summary (supported categories, capacity, hosting slots, price range, equipment tags). Output schema — the **ProposalDocument**:

```ts
const ProposalDocument = z.object({
  title: z.string().min(4).max(80),
  description: z.string().min(40).max(600),
  category: z.enum(EVENT_CATEGORY),
  format: z.string().max(200),                      // "Guided 60-min beginner session, then 45 min open conversation"
  intendedSocialExperience: z.string().max(200),
  suggestedSlot: z.enum(AVAILABILITY_SLOT),
  suggestedStartTimeLocal: z.string().regex(/^\d{2}:\d{2}$/),
  estimatedDurationMinutes: z.number().int().min(45).max(240),
  suggestedCapacity: z.number().int().min(4).max(60),
  suggestedPriceCents: z.number().int().min(0).nullable(),
  priceRangeCents: z.object({ min: z.number().int(), max: z.number().int() }).nullable(),
  demand: z.object({ band: z.enum(['4-5','6-9','10+','20+']), neighborhoodLabel: z.string(), topInterests: z.array(z.string()).max(5) }),
  whySuggested: z.string().max(400),
  assumptionsToValidate: z.array(z.string()).min(1).max(6),   // "Studio has 8 wheels", "Staff available Thursday 6–8pm"
  disclaimers: z.array(z.literal('demand_is_estimate')).default(['demand_is_estimate']),
});
```

System prompt rules: speak in terms of estimated interest, never attendance commitments; do not assert the venue is available or that any price is agreed; capacity must not exceed the business capacity provided; price must lie inside the business's stated range if one is given; keep the title plain and specific; the event should make it easy for strangers to talk.

### 5.8 Validate (code)
- `suggestedCapacity <= business.capacity`; `suggestedSlot` ∈ business `hosting_slots` (if set) and == cluster slot
- `suggestedPriceCents` within business price range when set; else within `[0, budget_p50 × 1.5]`
- Forbidden phrases scan on description/whySuggested: "confirmed", "guaranteed", "will attend", "booked" → regenerate once, then reject the cluster for this run
- `demand.band` equals the computed band (overwrite, never trust the model)
- Compute a concrete `suggestedStartsAt` (next occurrence of `slot` at `suggestedStartTimeLocal`, ≥ 5 days out) and store alongside

### 5.9 Store & notify
Insert `demand_clusters`, `demand_cluster_members`, `event_proposals`. `notify(business.owner_id, 'proposal_received', { proposalId, title, demandBand })`. Log `{ actor: 'planning_agent', action: 'generate_proposal', result: title }`. Update run stats.

### Idempotence & failure
The run is resumable per cluster; an LLM failure on one cluster is recorded in `stats.llmFailures` and does not fail the run. Each run holds a Postgres advisory lock so two triggers cannot overlap.

## 6. API

| Route | Notes |
|---|---|
| `POST /api/ai/generate-opportunities` | Body `{ dryRun?: boolean, source?: 'demand' }` (P1: `{ source: 'group', groupId, planId, suggestionIndex }`). Auth: `DEMO_MODE=1` any authenticated user; otherwise requires `profiles.is_operator` (added in 0402). Returns `{ runId }` immediately; the pipeline runs in the same request with `maxDuration = 60` (Vercel) and writes status as it goes |
| `GET /api/ai/opportunities/:runId` | `{ status, stats, proposals: [{ id, title, businessName, demandBand, status }] }` |
| `GET /api/cron/opportunities` | Header `Authorization: Bearer ${OPPORTUNITY_CRON_SECRET}`; calls the pipeline with `triggeredBy: 'cron'` |
| `POST /api/ai/proposals/:id/revise` (P1) | Business owner of a `pending` proposal; `{ note?, priceCents?, capacity?, slot? }` (at least one) → `201 { proposalId, supersedes, revision, proposal }`. The revision is a new `pending` row (`supersedes_id`, `revision` 1–3, `revision_request`, migration 0403); the old row becomes `expired` with `decision_note = 'superseded by revision'`. Owner numbers overwrite the model's; capacity ≤ venue capacity. `proposal` stays immutable and `business_edits` stays 05's `EventEdits` |

## 7. UI

`/admin/opportunities` (mounted only when `DEMO_MODE=1`):
- Big primary button **Generate Opportunities**, with a live stage tracker (Collecting → Clustering → Matching venues → Drafting proposals → Done) driven by polling the run endpoint
- Results table: cluster (category · slot · neighborhood · band), matched business, proposal title, status link to 05's proposal view
- Suppressed-clusters counter with tooltip "Below the minimum cohort size of 4, not shown to businesses"

This page is the presenter's control panel for Scene 3; it uses the shared Meta-aligned system ([`../design-system.md`](../design-system.md)): a single lead card with the blue Generate button and the stage tracker, results in a white table, generated proposal titles marked with the gradient `AiTag`. It should look intentional, not like a debug page.

## 8. Seed Contribution

None beyond relying on 02's `preferences.json` design. Provide `tests/fixtures/demand/users-scene3.json` (the 14 seeded preference rows as `SharablePreferences`) so the pipeline's unit tests and the `MOCK_AI` fixture `demand.generate_proposal.json` ("Beginner Pottery & Coffee Night", Kiln & Cup, thu_eve, 18:00, 120 min, capacity 10, $2000, band 6–9) run without the database.

## 9. Tests

| Layer | Cases |
|---|---|
| Unit | geocell + neighbor merge; a user lands in ≤ 1 cluster per (category, slot); threshold suppresses 3-person cohort; banding; interest tag count floor; business scoring rejects capacity < cohort; validator rejects over-capacity, out-of-range price, forbidden phrases, band mismatch; `suggestedStartsAt` is ≥ 5 days out on the right weekday; dedup window |
| Integration (MOCK_AI, seeded) | Scene 3 run creates exactly one `creative/thu_eve` proposal for Kiln & Cup and one `games/fri_eve` for Meeple House; opted-out user absent from `demand_cluster_members`; second run within 14 days creates 0 new proposals; business owner can select the proposal but gets 0 rows from `demand_cluster_members`; run stats populated; notification delivered to owner |
| Prompt eval (manual, live) | 5 briefs → all pass validator first try ≥ 4/5; human check that no text implies confirmation |
| E2E | Scene 3: operator clicks Generate → tracker completes → table shows the pottery proposal |

## 10. Acceptance Criteria

1. From the seeded data, one click yields the "Beginner Pottery & Coffee Night" proposal routed to Kiln & Cup with demand band 6–9 and at least one `assumptionsToValidate`.
2. No proposal, cluster row, or API response visible to a business contains a user id, name, raw count, or exact coordinate.
3. A cohort below `MIN_COHORT_SIZE` is never materialized as a business-visible cluster.
4. The pipeline is safe to trigger twice (dedup) and concurrently (advisory lock).
5. LLM failure on one cluster does not block the others; the run reports it.

## 11. Independence Notes

- Stubs: `findCandidateBusinesses` reading `businesses` (create a minimal local `businesses` table in a test-only migration if 05 hasn't landed), `getSharablePreferences` reading `user_preferences` with admin client, `notify` no-op.
- Work can begin entirely against `tests/fixtures/demand/*.json`; the DB stage is last.

## 12. Risks

| Risk | Mitigation |
|---|---|
| Model implies confirmed details | Forbidden-phrase validator + schema `disclaimers` + 05 UI labels everything "AI suggestion" |
| Clusters too sparse in demo data | Seed engineered for two clear clusters; `MIN_COHORT_SIZE` configurable; operator page shows suppression counts to explain behavior |
| Re-identification via small `top_interests` | Tag count floor of 2 and band display; never show exact count |
| Vercel function timeout on large runs | Cap clusters per run; per-cluster failure isolation; cron path can loop runs |
