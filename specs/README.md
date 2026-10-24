# CommonGround — Engineering Specs

CommonGround is a two-sided, AI-powered local social discovery platform. People get a personal AI agent that learns their interests and availability, finds compatible people and groups nearby, and recommends events. Aggregated, opt-in community demand is turned by AI into event proposals that local businesses approve, edit, or reject before anything is published. Users RSVP, meet, and keep the relationship going.

This directory splits the hackathon MVP into **six workstreams that can be built in parallel**. Each `specs.md` is self-contained: it restates the slice of the product it owns, the tables and API routes it owns, the contracts it consumes from the others, how to build it in isolation with mocks, and its acceptance tests.

| # | Workstream | Owns | Demo scenes |
|---|---|---|---|
| [01](./01-core-platform/specs.md) | Core Platform & Data Infrastructure | Repo scaffold, auth, schema baseline, RLS, shared types, API envelope, notifications, seed data, deployment | Setup for all scenes |
| [02](./02-onboarding-and-agent/specs.md) | Consumer Onboarding & Personal AI Agent | Conversational onboarding, preference extraction, agent chat, preference editor, sharing permissions, action log | Scene 1, Scene 6 (agent suggestion) |
| [03](./03-matching-and-groups/specs.md) | People Matching, Connections & Groups | Compatibility scoring, match explanations, connection requests, block/report, groups, invitations, group AI planner | Scene 2 |
| [04](./04-demand-and-proposal-engine/specs.md) | Community Demand & Event Proposal Engine | Demand clustering, privacy thresholds, LLM proposal generation, business matching, "Generate Opportunities" worker | Scene 3 |
| [05](./05-business-app/specs.md) | Business Application | Business onboarding, dashboard, proposal inbox (approve/edit/reject), event editor, event management, attendee lists, insights | Scene 4 |
| [06](./06-events-and-rsvp/specs.md) | Events, Discovery, RSVP & Follow-ups | Event feed, personalized recommendations with explanations, event details, transactional RSVP, attendee visibility, group invites, My Activity, post-event reconnection | Scene 5, Scene 6 |

The shared visual theme (Meta-aligned: Facebook light/dark surfaces, Meta blue for actions, the Meta AI gradient reserved for AI-generated content) is specified in [`design-system.md`](./design-system.md) and is binding for every screen.

The end-to-end flow and the system architecture are drawn in [`commonground-flow.drawio`](./commonground-flow.drawio) (open at https://app.diagrams.net or with the VS Code Draw.io extension).

---

## 1. Shared Technical Decisions (binding for every workstream)

| Area | Decision |
|---|---|
| Framework | Next.js 15 (App Router, React Server Components, Route Handlers), TypeScript strict, Tailwind CSS |
| Package manager / runtime | pnpm, Node 20 LTS |
| Database | Supabase Postgres with Row Level Security. Migrations are plain SQL in `supabase/migrations/` |
| Auth | Supabase Auth (email + password, plus magic link). One auth user may own a consumer profile and/or a business |
| AI | Anthropic Claude API (`claude-sonnet-5-5` for chat and generation, `claude-haiku-5-5` for cheap explanations) with **structured JSON outputs validated by Zod**. All AI calls go through `src/lib/ai/` |
| Validation | Zod schemas in `src/shared/schemas/` are the single source of truth for request bodies, LLM outputs, and DB row types |
| Testing | Vitest for unit/integration, Playwright for E2E, `supabase start` local stack for integration tests |
| Deployment | Vercel (web) + hosted Supabase project. One `.env.example` kept current by workstream 01 |
| Style | Immutable data (no in-place mutation), small files (<400 lines), early returns, explicit error handling, no secrets in code |
| Visual theme | Meta-aligned design system in [`design-system.md`](./design-system.md): tokens in `src/styles/tokens.css`, primitives in `src/features/core/components/ui/`, light + dark, `AiTag` as the only AI marker |

### Repo layout

```
commonground/
├── src/
│   ├── app/
│   │   ├── (consumer)/           # consumer screens: /, /discover, /match, /groups, /events, /agent, /activity
│   │   ├── (business)/business/  # business screens: /business, /business/proposals, /business/events, ...
│   │   ├── (auth)/               # /login, /signup, /onboarding, /business/onboarding
│   │   └── api/                  # Route Handlers, one folder per resource
│   ├── features/
│   │   ├── core/                 # 01: auth helpers, notifications, API envelope, layout shell
│   │   ├── agent/                # 02
│   │   ├── matching/             # 03
│   │   ├── groups/               # 03
│   │   ├── demand/               # 04
│   │   ├── proposals/            # 04 (generation) + 05 (review)
│   │   ├── business/             # 05
│   │   └── events/               # 06
│   ├── lib/
│   │   ├── supabase/             # server/client/admin clients, typed `Database`
│   │   ├── ai/                   # Claude client, `generateStructured()`, prompt registry, MOCK_AI switch
│   │   └── api/                  # `ok()`, `fail()`, `withAuth()`, error codes
│   └── shared/
│       ├── enums.ts              # status enums below
│       ├── schemas/              # Zod schemas (one file per entity)
│       └── types.ts              # inferred TS types
├── supabase/
│   ├── migrations/               # NNNN_<workstream>_<name>.sql  (see numbering below)
│   └── seed/                     # seed.ts + fixtures/*.json
├── tests/
│   ├── unit/ · integration/ · e2e/
└── specs/                        # this directory
```

**Migration numbering** avoids merge conflicts: workstream 01 uses `0100–0199`, 02 uses `0200–0299`, 03 `0300–0399`, 04 `0400–0499`, 05 `0500–0599`, 06 `0600–0699`. Later numbers may add columns to earlier tables with `ALTER TABLE`; never edit a merged migration.

### Feature module shape (every workstream follows this)

```
src/features/<name>/
├── server/        # data access + domain logic, server-only (`import "server-only"`)
├── components/    # React components
├── hooks/         # client hooks
├── schemas.ts     # re-exports or extends shared Zod schemas
└── index.ts       # public surface other features may import
```

Features import each other **only through `index.ts`** and only the contracts listed in this README. Everything else is private.

---

## 2. Shared Enums (`src/shared/enums.ts`)

```ts
export const EVENT_STATUS = ['proposed','awaiting_approval','approved_draft','published','full','completed','cancelled'] as const;
export const PROPOSAL_STATUS = ['pending','approved','modified','rejected','expired'] as const;
export const CONNECTION_STATUS = ['pending','accepted','declined'] as const;
export const MEMBERSHIP_STATUS = ['invited','active','removed','left'] as const;
export const MEMBER_ROLE = ['owner','admin','member'] as const;
export const RSVP_STATUS = ['confirmed','cancelled','waitlisted'] as const;
export const VISIBILITY = ['public','private'] as const;
export const GROUP_SIZE_PREF = ['one_on_one','small','medium','large'] as const; // 2 / 3-6 / 7-12 / 13+
export const SOCIAL_GOAL = ['make_friends','explore_city','learn_skill','find_activity_partners','network'] as const;
export const EVENT_CATEGORY = ['creative','food_drink','games','outdoors','fitness','learning','music','community'] as const;
export const AVAILABILITY_SLOT = ['mon_eve','tue_eve','wed_eve','thu_eve','fri_eve','sat_day','sat_eve','sun_day','sun_eve'] as const;
export const NOTIFICATION_TYPE = ['connection_request','connection_accepted','group_invite','event_recommended','event_published','rsvp_confirmed','event_updated','event_cancelled','proposal_received','proposal_decided','reconnect_suggestion'] as const;
```

Event status transitions (enforced in workstream 05/06 server code, never in the client):

```
proposed → awaiting_approval → approved_draft → published → full ⇄ published → completed
                 └──────────────→ cancelled      └──────────→ cancelled
```

---

## 3. Shared Schema Baseline

Workstream 01 ships the baseline tables below in `0100_core.sql`. Other workstreams **own** and extend the tables marked with their number. Every table has `id uuid primary key default gen_random_uuid()`, `created_at timestamptz default now()`, and `updated_at` maintained by a trigger.

| Table | Owner | Purpose |
|---|---|---|
| `profiles` | 01 | One row per auth user: display name, avatar, bio, `coarse_location` (neighborhood label + lat/lng rounded to 2 dp), `is_discoverable`, `is_adult_confirmed` |
| `notifications` | 01 | In-app notifications; any workstream inserts via `notify()` |
| `agent_action_log` | 01 | Audit of every AI action: actor, action type, permissions used, result summary |
| `user_preferences` | 02 | Structured preferences: interests[], availability_slots[], social_goals[], group_size_pref, budget_min/max, travel_radius_km, activity_prefs[] |
| `agent_profiles` | 02 | Approved preference summary, consent flags (`allow_matching`, `allow_demand_aggregation`, `share_interests_with_attendees`, `share_name_with_business`) |
| `agent_conversations`, `agent_messages` | 02 | Onboarding and chat history (private, never shared) |
| `connections`, `blocks`, `reports` | 03 | Connection requests and safety |
| `groups`, `group_members`, `invitations` | 03 | Groups and invitations (group + event invitations share the table) |
| `group_plans` | 03 | AI activity suggestions for a group plus votes |
| `businesses`, `business_capabilities` | 05 | Business profile, hours, capacity, event categories, pricing preferences, hosting slots |
| `demand_clusters`, `demand_cluster_members` | 04 | Detected cohorts; members table is **service-role only** |
| `event_proposals` | 04 (insert) / 05 (decide) | AI-generated proposals routed to a business |
| `events` | 05 (write) / 06 (read, status to full/completed) | Published and draft events |
| `rsvps` | 06 | RSVP rows with capacity enforced by a Postgres function |
| `event_feedback`, `reconnect_interest` | 06 | Post-event signals |

**Privacy invariants (every workstream must honor):**
1. Businesses never read `profiles`, `user_preferences`, `agent_profiles`, or `demand_cluster_members`. They see aggregated counts only.
2. Nothing from `agent_messages` is ever copied into another table or into a prompt for another user's agent.
3. Cross-user AI coordination uses only fields the user has consented to (`agent_profiles.consent`).
4. Location exposed to other users is `coarse_location` only.
5. Cohort counts below `MIN_COHORT_SIZE` (default 4) are never shown to a business.

---

## 4. Shared API Contract

All Route Handlers return the envelope from `src/lib/api/envelope.ts`:

```ts
type ApiOk<T>  = { ok: true;  data: T; meta?: { total?: number; page?: number; limit?: number } };
type ApiErr    = { ok: false; error: { code: ErrorCode; message: string; details?: unknown } };
type ErrorCode = 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT' | 'CAPACITY_FULL' | 'RATE_LIMITED' | 'AI_UNAVAILABLE' | 'INTERNAL';
```

Helpers: `ok(data, meta?)`, `fail(code, message, status?)`, `withAuth(handler)` (injects `{ user, supabase }`), `withBusinessOwner(handler)` (also injects `business`), `parseBody(schema, req)`.

Routes by owner (all under `/api`):

| Workstream | Routes |
|---|---|
| 01 | `GET /me`, `PATCH /me`, `GET /notifications`, `PATCH /notifications/:id/read`, `POST /dev/seed` (dev only) |
| 02 | `POST /users/onboard`, `POST /agent/chat`, `GET/PATCH /agent/preferences`, `GET/PATCH /agent/permissions`, `GET /agent/log` |
| 03 | `GET /matches`, `POST /connections`, `PATCH /connections/:id`, `GET /connections`, `POST /users/:id/block`, `POST /users/:id/report`, `POST /groups`, `GET /groups`, `GET /groups/:id`, `PATCH /groups/:id`, `POST /groups/:id/invite`, `PATCH /invitations/:id`, `DELETE /groups/:id/members/:userId`, `POST /groups/:id/leave`, `POST /groups/:id/plan`, `POST /groups/:id/plans/:planId/vote` |
| 04 | `POST /ai/generate-opportunities`, `GET /ai/opportunities/:runId` |
| 05 | `POST /business`, `GET/PATCH /business/me`, `GET /business/proposals`, `PATCH /business/proposals/:id`, `POST /business/events`, `PATCH /business/events/:id`, `POST /business/events/:id/publish`, `POST /business/events/:id/cancel`, `GET /business/events/:id/attendees`, `GET /business/insights` |
| 06 | `GET /events`, `GET /events/:id`, `GET /events/recommended`, `POST /events/:id/rsvp`, `DELETE /events/:id/rsvp`, `GET /events/:id/attendees`, `POST /events/:id/invite-group`, `GET /activity`, `POST /events/:id/feedback`, `POST /events/:id/reconnect`, `GET /businesses/nearby` |

### Cross-workstream function contracts (exported from each feature's `index.ts`)

```ts
// 01 core
notify(userId: string, type: NotificationType, payload: Record<string, unknown>): Promise<void>
logAgentAction(input: { userId: string; action: string; permissionsUsed: string[]; result: string }): Promise<void>

// 02 agent
getSharablePreferences(userId: string, purpose: 'matching' | 'demand' | 'group_plan'): Promise<SharablePreferences | null>
// returns ONLY consented fields, or null when the user has not consented for that purpose
explainRecommendation(input: ExplainInput): Promise<string>   // short, user-facing "why"

// 03 matching / groups
getCompatibilityScore(a: SharablePreferences, b: SharablePreferences): CompatibilityResult
getGroupMemberIds(groupId: string): Promise<string[]>

// 04 demand
runOpportunityPipeline(opts: { triggeredBy: 'manual' | 'cron'; dryRun?: boolean }): Promise<OpportunityRunSummary>

// 05 business
getBusinessPublicCard(businessId: string): Promise<BusinessPublicCard>
findCandidateBusinesses(criteria: VenueCriteria): Promise<BusinessMatch[]>

// 06 events
getUpcomingEventsForUser(userId: string): Promise<EventSummary[]>
getEventPublic(eventId: string): Promise<EventPublic | null>
```

Types `SharablePreferences`, `ExplainInput`, `CompatibilityResult`, `VenueCriteria`, `BusinessMatch`, `EventSummary`, `EventPublic`, `BusinessPublicCard` live in `src/shared/types.ts` and are defined in the owning spec. `SharablePreferences` (with `interestCategories: EventCategory[]` and a nullable `groupSizePref`) and `ExplainInput` (`{ viewer, target, breakdown }`) follow spec 02 §5. Workstream 01 lands the file with these types on day one so every workstream compiles against the same shapes.

---

## 5. Working Independently

- **Mocks:** `MOCK_AI=1` makes `src/lib/ai/` return fixture JSON from `src/lib/ai/fixtures/` instead of calling Claude. Every workstream adds fixtures for the prompts it owns.
- **Seed:** `pnpm db:seed` loads `supabase/seed/fixtures/*.json` (16 users, 3 businesses, 6 events, 2 groups). Each workstream appends to the fixtures it needs; the demo path is described in each spec.
- **Stubs:** Until a dependency ships, import its contract from `src/shared/types.ts` and use a local stub in `src/features/<name>/server/stubs.ts`. Delete the stub when the real export lands.
- **Branches:** `ws/01-core`, `ws/02-agent`, `ws/03-matching`, `ws/04-demand`, `ws/05-business`, `ws/06-events`. Merge 01 first; others rebase on it.
- **Committing:** every clone uses the repo's `/commit` skill (`.claude/skills/commit/`). Run the setup once per clone with `bash .claude/skills/commit/scripts/set-identity.sh "Name" "github-email" "github-user" <ws>` (or paste `.claude/skills/commit/SETUP_PROMPT.md` into Claude Code). After that `/commit` and `/commit push` produce Conventional Commits authored by you, on your `ws/` branch, with no AI attribution lines and a secret scan on the staged diff.
- **Definition of done** for each workstream: migrations apply cleanly on a fresh `supabase db reset`, unit + integration tests pass with ≥80% coverage on `features/<name>/server`, Playwright demo-scene test passes, no RLS policy allows a business to read user-private tables.

---

## 6. Demo Script Mapping

| Scene | What is shown | Workstreams |
|---|---|---|
| 1 | New user chats: "I just moved here, I like pottery and coffee shops, free Thursday evenings, small groups." Structured profile appears for review. | 02 (01 for auth) |
| 2 | Match page shows compatible people with explanations; user connects and creates a small group. | 03 |
| 3 | Operator clicks "Generate Opportunities"; demand cluster "creative / thu_eve / Mission" with 6 interested is detected and a proposal is generated for the pottery studio. | 04 |
| 4 | Pottery studio dashboard shows the proposal; owner changes price $20→$25 and approves; event is published. | 05 |
| 5 | Consumer feed recommends "Beginner Pottery & Coffee Night" with a personal explanation; user RSVPs; group sees it. | 06 |
| 6 | Event marked completed; two attendees express reconnect interest; their agents propose a follow-up coffee meetup. | 06 + 02 |
