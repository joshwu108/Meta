# Workstream 01 — Core Platform & Data Infrastructure

**Owner role:** Platform / infrastructure engineer
**Depends on:** nothing (lands first)
**Consumed by:** every other workstream
**Read first:** [`../README.md`](../README.md) sections 1–5

---

## 1. Purpose

Workstream 01 builds the ground every other workstream stands on: the Next.js application shell, Supabase project with the baseline schema and Row Level Security, authentication for both consumers and business owners, the shared type/schema package, the API envelope and auth helpers, the AI client wrapper with a mock switch, in-app notifications, the seed dataset, CI, and deployment. It also owns the app shell UI (navigation, auth pages, layout) so that other workstreams only build screens.

This workstream contains no product-specific AI logic. Its success is measured by how fast the other five workstreams can get to a green test suite on a fresh clone.

## 2. Scope

### In scope (P0)
- Repo scaffold, tooling, lint/format/typecheck, CI
- Supabase local stack config, migration `0100_core.sql`, RLS baseline, `updated_at` trigger
- Supabase Auth integration: sign up, sign in, magic link, sign out, session refresh in middleware
- Role model: consumer profile vs business owner, both allowed on one auth user
- `profiles` table and `/api/me`
- `notifications` table, `notify()` helper, `/api/notifications`, notification bell UI
- `agent_action_log` table and `logAgentAction()` helper
- `src/shared/enums.ts`, `src/shared/types.ts`, `src/shared/schemas/*` baseline
- `src/lib/api` envelope and `withAuth` / `withBusinessOwner` / `parseBody`
- `src/lib/ai` Claude wrapper with `generateStructured()` and `MOCK_AI` fixtures
- Seed runner and the base fixture set (15 users, 3 businesses, 6 events, 2 groups)
- App shell: responsive layout, consumer nav (Discover, Match, Groups, Events, Agent, Activity), business nav (Dashboard, Proposals, Events, Insights), auth pages
- `.env.example`, Vercel project, hosted Supabase project, `README` quick start
- Observability: structured server logging (`src/lib/log.ts`) that redacts PII fields

### Out of scope
- Any domain tables beyond `profiles`, `notifications`, `agent_action_log` (other workstreams add their own migrations)
- Email delivery, push notifications
- Rate limiting beyond a simple per-user in-memory guard on AI routes

## 3. Data Model (migration `0100_core.sql`)

```sql
create extension if not exists "pgcrypto";

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_url text,
  bio text check (char_length(bio) <= 500),
  neighborhood text,                       -- human label, e.g. "Mission District"
  coarse_lat numeric(6,2),                 -- rounded to 2 dp (~1 km)
  coarse_lng numeric(6,2),
  is_discoverable boolean not null default false,
  is_adult_confirmed boolean not null default false,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null,                      -- NOTIFICATION_TYPE enum, checked in app
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on notifications (user_id, created_at desc) where read_at is null;

create table agent_action_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,   -- null for system-level runs
  actor text not null,                      -- 'personal_agent' | 'coordination' | 'demand_engine' | 'planning_agent'
  action text not null,                     -- e.g. 'extract_preferences', 'score_matches', 'generate_proposal'
  permissions_used text[] not null default '{}',
  result text not null,                     -- short human-readable summary, no PII
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on agent_action_log (user_id, created_at desc);

-- updated_at trigger reused by every workstream
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger profiles_updated before update on profiles for each row execute function set_updated_at();

-- auto-create profile on signup
create or replace function handle_new_user() returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'display_name', 'New member'));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();
```

### RLS baseline

```sql
alter table profiles enable row level security;
alter table notifications enable row level security;
alter table agent_action_log enable row level security;

-- profiles: self full access; others may read a *public card* only through the view below
create policy profiles_self on profiles for all using (auth.uid() = id) with check (auth.uid() = id);

create view profile_public_cards with (security_invoker = false) as
  select id, display_name, avatar_url, bio, neighborhood from profiles where is_discoverable = true;
grant select on profile_public_cards to authenticated;

create policy notifications_self on notifications for select using (auth.uid() = user_id);
create policy notifications_self_update on notifications for update using (auth.uid() = user_id);
-- inserts happen with the service role from notify()

create policy agent_log_self on agent_action_log for select using (auth.uid() = user_id);
```

Rule for all workstreams: **business accounts get no policy on any user-private table.** Business-facing reads must go through aggregated views or service-role server code that strips identity.

## 4. Shared Code Delivered

### `src/lib/supabase/`
- `server.ts` — `createServerClient()` bound to cookies (RSC and Route Handlers)
- `client.ts` — browser client
- `admin.ts` — service-role client, `import "server-only"`, used only by `notify()`, seed, and workstream 04 pipeline
- `database.types.ts` — generated by `pnpm db:types` (`supabase gen types typescript --local`)

### `src/lib/api/`
```ts
export function ok<T>(data: T, meta?: Meta, init?: ResponseInit): NextResponse
export function fail(code: ErrorCode, message: string, status?: number, details?: unknown): NextResponse
export function withAuth(handler: (ctx: AuthCtx, req: Request, params: Params) => Promise<Response>)
export function withBusinessOwner(handler: (ctx: BusinessCtx, req: Request, params: Params) => Promise<Response>)
export async function parseBody<T>(schema: ZodSchema<T>, req: Request): Promise<T>   // throws ApiError(VALIDATION)
export class ApiError extends Error { constructor(public code: ErrorCode, message: string, public status = 400) }
```
`withAuth` catches `ApiError` and `ZodError` and converts them to the envelope; unknown errors are logged with a request id and returned as `INTERNAL` without leaking the message.

### `src/lib/ai/`
```ts
export async function generateStructured<T>(opts: {
  prompt: PromptId; input: unknown; schema: ZodSchema<T>; model?: 'fast' | 'smart'; maxRetries?: number;
}): Promise<T>
export async function chat(opts: { prompt: PromptId; messages: ChatMessage[]; system?: string }): Promise<string>
```
- Uses `@anthropic-ai/sdk`; `smart` = `claude-sonnet-5-5`, `fast` = `claude-haiku-5-5`
- Forces JSON via a tool definition generated from the Zod schema; validates the result; retries once with the validation error appended; throws `ApiError('AI_UNAVAILABLE')` after retries
- `MOCK_AI=1` → returns `src/lib/ai/fixtures/<promptId>.json` (deterministic, used in CI)
- Every call is logged with prompt id, model, latency, token usage; never logs raw prompt content
- `PromptId` is a union registered in `src/lib/ai/prompts/index.ts`; each workstream appends its own prompt ids and fixture files

### `src/features/core/`
```ts
export async function notify(userId, type, payload): Promise<void>
export async function logAgentAction(input): Promise<void>
export async function getCurrentUser(): Promise<CurrentUser | null>   // { id, profile, businessId? }
export function AppShell({ mode: 'consumer' | 'business', children })
export function NotificationBell()
```

### `src/shared/types.ts`
Landed on day one with the cross-workstream types (full definitions in owning specs, baseline shapes here so everything compiles):

```ts
export type SharablePreferences = { userId: string; interests: string[]; availabilitySlots: AvailabilitySlot[]; socialGoals: SocialGoal[]; groupSizePref: GroupSizePref; budgetMin: number | null; budgetMax: number | null; travelRadiusKm: number; activityPrefs: string[]; coarseLat: number | null; coarseLng: number | null; neighborhood: string | null };
export type CompatibilityResult = { score: number; breakdown: { interests: number; availability: number; social: number; location: number; budget: number }; sharedInterests: string[]; sharedSlots: AvailabilitySlot[]; hardFilterFailed: null | 'distance' | 'blocked' | 'not_discoverable' };
export type VenueCriteria = { category: EventCategory; cohortSize: number; slot: AvailabilitySlot; centerLat: number; centerLng: number; radiusKm: number; budgetMax: number | null };
export type BusinessMatch = { businessId: string; name: string; score: number; reasons: string[] };
export type BusinessPublicCard = { id: string; name: string; category: EventCategory; neighborhood: string; address: string; description: string; imageUrl: string | null };
export type EventSummary = { id: string; title: string; startsAt: string; status: EventStatus; business: BusinessPublicCard; rsvpStatus: RsvpStatus | null };
export type EventPublic = EventSummary & { description: string; category: EventCategory; endsAt: string; capacity: number; confirmedCount: number; priceCents: number | null; format: string; source: 'ai_proposal' | 'business_manual' | 'group_request' };
```

## 5. UI Delivered

| Route | Content |
|---|---|
| `/login`, `/signup` | Email/password + magic link; signup asks display name and the adult confirmation checkbox (required, stored in `is_adult_confirmed`) |
| `/signup?as=business` | Same, then redirects to `/business/onboarding` (built by 05) |
| Consumer shell | Top bar on mobile, left rail ≥1024px; nav items Discover, Match, Groups, Events, Agent, Activity; notification bell with unread count |
| Business shell | Dashboard, Proposals, Events, Insights; switch link to consumer app if the user also has a profile |
| `/` | Redirects: no session → `/login`; profile without `onboarding_completed_at` → `/onboarding`; else `/discover` |

Design direction (binding for the shell, recommended for all screens): warm editorial look, off-white surface, ink text, one accent (terracotta) used semantically for primary actions and "AI suggestion" markers, serif display face paired with a humanist sans for body. Tokens live in `src/styles/tokens.css`. Dark mode is **not** required for the MVP.

## 6. Seed Data (`supabase/seed/`)

`pnpm db:seed` runs `seed.ts` with the admin client and loads fixtures in dependency order. Base fixtures delivered here:

- `users.json` — 15 users with display names, neighborhoods (Mission, Hayes Valley, Castro, SoMa, Noe Valley), coarse coordinates, `is_discoverable: true` for 13. Password for every seeded user is `demo-pass-1234`. User `demo.new@commonground.test` has **no** preferences so Scene 1 can be run live.
- `businesses.json` — Kiln & Cup (pottery studio, Mission), Ritual Grounds (café, Hayes Valley), Meeple House (board-game venue, SoMa), each with an owner account `owner.<slug>@commonground.test`.
- `events.json` — 6 published events across the three venues over the next 14 days.
- `groups.json` — 2 groups ("Mission Makers", public, 4 members; "Thursday Night Crew", private, 3 members).

Workstream 02 adds `preferences.json` (interests/availability for the 14 seeded users, engineered so that 6 share `creative` + `thu_eve` + Mission radius for Scene 3). The seed runner must be idempotent: it deletes by `email like '%@commonground.test'` before inserting.

`POST /api/dev/seed` wraps the same runner and is only mounted when `NODE_ENV !== 'production'` or `DEMO_MODE=1`.

## 7. Tooling, CI, Deployment

- `pnpm dev` (Next), `pnpm db:start` / `db:reset` / `db:types` / `db:seed`, `pnpm test`, `pnpm test:e2e`, `pnpm lint`, `pnpm typecheck`
- GitHub Actions: lint → typecheck → unit/integration (against `supabase start`) → Playwright smoke with `MOCK_AI=1`
- Vercel preview per PR; `main` deploys to production. Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `MOCK_AI`, `DEMO_MODE`, `MIN_COHORT_SIZE`, `OPPORTUNITY_CRON_SECRET`
- `src/lib/log.ts`: JSON logs with `requestId`, `userId` hashed, redaction list (`email`, `display_name`, `bio`, message bodies)

## 8. Security Checklist

- [ ] Service-role key only in `admin.ts` behind `server-only`
- [ ] Every Route Handler wrapped in `withAuth`/`withBusinessOwner` or explicitly marked public in a comment
- [ ] RLS enabled on every table created by any workstream (CI test queries `pg_tables` and fails if any public table lacks RLS)
- [ ] CSP header set in `next.config.ts` (`default-src 'self'`, Supabase and Anthropic origins in `connect-src`)
- [ ] Security headers: HSTS, nosniff, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] Dev seed route unreachable in production

## 9. Tests

| Layer | Cases |
|---|---|
| Unit | envelope helpers; `parseBody` returns `VALIDATION` with field paths; `generateStructured` retries once on schema failure then throws `AI_UNAVAILABLE`; `MOCK_AI` returns fixture; log redaction |
| Integration | signup creates profile row; profile RLS blocks reading another user's row; `profile_public_cards` hides non-discoverable users; `notify()` inserts and user can list/mark read; business owner cannot select from `profiles` |
| E2E | signup → redirected to onboarding; login → discover; notification bell shows unread count |
| CI guard | every table has RLS; every migration applies on fresh reset; `pnpm db:types` output is committed and up to date |

## 10. Acceptance Criteria

1. Fresh clone + `.env` + `pnpm i && pnpm db:start && pnpm db:reset && pnpm db:seed && pnpm dev` works in under 10 minutes.
2. A seeded consumer and a seeded business owner can log in and see their respective shells.
3. All shared helpers and types in sections 4 are exported and documented with TSDoc.
4. CI is green on `main` with the guards in section 9.
5. Preview deployment URL works with `MOCK_AI=1` and `DEMO_MODE=1`.

## 11. Risks

| Risk | Mitigation |
|---|---|
| Other workstreams blocked until this merges | Ship scaffold + types + envelope in the first 2 hours as a thin PR; schema/RLS/seed in a second PR the same day |
| Type drift between Zod schemas and generated DB types | `pnpm db:types` committed; a unit test asserts each Zod row schema `satisfies` the generated row type |
| RLS mistakes leak user data to businesses | Integration test suite in section 9 runs as both roles; add a case whenever a workstream adds a table |
