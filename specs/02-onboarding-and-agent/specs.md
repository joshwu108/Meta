# Workstream 02 — Consumer Onboarding & Personal AI Agent

**Owner role:** AI / full-stack engineer (consumer side)
**Depends on:** 01 (auth, envelope, `generateStructured`, `profiles`)
**Consumed by:** 03 (sharable preferences for matching and group planning), 04 (sharable preferences for demand aggregation), 06 (explanations, follow-up suggestions)
**Read first:** [`../README.md`](../README.md) sections 2–5

---

## 1. Purpose

Every CommonGround user gets a personal AI agent. This workstream builds that agent: the conversational onboarding that turns "I just moved here, I like pottery and coffee shops, I'm free Thursday evenings and want to meet people in a small group" into a structured, editable preference profile; the ongoing chat interface; the preference and permission management screens; and the **coordination boundary** through which other parts of the system may read a user's preferences, limited strictly to what the user has consented to.

The agent is advisory. It never accepts invitations, RSVPs, or commits the user to anything. Everything it infers is shown to the user for confirmation before it is used.

## 2. PRD Coverage

U-02..U-08, AI-01..AI-06 (P0), AI-07..AI-09 (P1), Screen 1 (Welcome / Onboarding), Screen 7 (My AI Agent), Section 8.1 component 1 (Personal Preference Agent), Section 8.2 (agent-to-agent communication boundary), Section 12.2 (agent permissions).

## 3. Scope

### In scope (P0)
- `/onboarding`: 3-step flow — (1) basics form: neighborhood, travel radius, adult confirmation already captured at signup; (2) conversational AI onboarding; (3) review & confirm extracted preferences, set discoverability and sharing permissions
- Preference extraction prompt with structured output and confidence per field
- `/agent`: chat with the personal agent, with suggestion cards (people, events, groups) that deep-link into 03/06 screens
- `/agent/preferences`: structured editor for every preference field, including "AI-inferred" badges and the ability to delete inferred values
- `/agent/permissions`: consent toggles that gate what leaves the agent
- `getSharablePreferences()` contract for 03/04 and `explainRecommendation()` for 03/06
- Agent action log viewer (`/agent/log`) reading `agent_action_log`
- Seed fixture `preferences.json` for the 14 seeded users

### P1 (if time)
- Agent helps resolve group scheduling conflicts (invoked by 03's planner with consented member preferences)
- Post-event follow-up suggestion prompt (invoked by 06)
- Feedback memory: thumbs up/down on suggestions stored and injected into later prompts

### Out of scope
- Voice, Facebook/Instagram enrichment, autonomous actions of any kind

## 4. Data Model (migrations `0200_agent.sql`)

```sql
create table user_preferences (
  user_id uuid primary key references profiles(id) on delete cascade,
  interests text[] not null default '{}',             -- free-form tags normalized to lowercase kebab, e.g. 'pottery','coffee','board-games'
  interest_categories text[] not null default '{}',   -- EVENT_CATEGORY values derived from interests
  availability_slots text[] not null default '{}',    -- AVAILABILITY_SLOT values
  social_goals text[] not null default '{}',          -- SOCIAL_GOAL values
  group_size_pref text,                               -- GROUP_SIZE_PREF
  budget_min_cents int,
  budget_max_cents int,
  travel_radius_km numeric(4,1) not null default 5,
  activity_prefs text[] not null default '{}',        -- 'beginner-friendly','hands-on','quiet','outdoors'...
  dealbreakers text[] not null default '{}',          -- 'no-alcohol','no-late-nights'
  field_sources jsonb not null default '{}',          -- { "interests": "ai_inferred" | "user_set", ... }
  updated_at timestamptz not null default now()
);

create table agent_profiles (
  user_id uuid primary key references profiles(id) on delete cascade,
  summary text,                                       -- 2–3 sentence approved summary shown to the user
  consent jsonb not null default '{"allow_matching": false, "allow_demand_aggregation": false, "allow_group_planning": false, "share_interests_with_attendees": false, "share_name_with_business": false}',
  consent_updated_at timestamptz,
  feedback_notes jsonb not null default '[]',         -- P1: [{ "at": ts, "about": "event:<id>", "signal": "up"|"down", "note": "..." }]
  updated_at timestamptz not null default now()
);

create table agent_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('onboarding','chat')),
  created_at timestamptz not null default now()
);

create table agent_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references agent_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  suggestions jsonb,                                  -- optional structured cards rendered in the UI
  created_at timestamptz not null default now()
);
create index on agent_messages (conversation_id, created_at);

alter table user_preferences enable row level security;
alter table agent_profiles enable row level security;
alter table agent_conversations enable row level security;
alter table agent_messages enable row level security;
create policy prefs_self on user_preferences for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy agent_self on agent_profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy conv_self on agent_conversations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy msg_self on agent_messages for all using (exists (select 1 from agent_conversations c where c.id = conversation_id and c.user_id = auth.uid()));
```

**Hard rule:** no other table ever references `agent_messages`, and no server function outside this feature reads it. Cross-user flows read only through `getSharablePreferences()`.

## 5. AI Design

### Prompt `agent.extract_preferences` (model: smart)
Input: the onboarding transcript plus the current structured preferences (may be empty). Output schema:

```ts
const ExtractedPreferences = z.object({
  interests: z.array(z.object({ tag: z.string(), confidence: z.number().min(0).max(1) })),
  interestCategories: z.array(z.enum(EVENT_CATEGORY)),
  availabilitySlots: z.array(z.enum(AVAILABILITY_SLOT)),
  socialGoals: z.array(z.enum(SOCIAL_GOAL)),
  groupSizePref: z.enum(GROUP_SIZE_PREF).nullable(),
  budgetMaxCents: z.number().int().nullable(),
  activityPrefs: z.array(z.string()),
  dealbreakers: z.array(z.string()),
  summary: z.string().max(400),
  followUpQuestion: z.string().nullable(),   // asked when something important is still unknown
  missingFields: z.array(z.string()),
});
```

System prompt rules: extract only what the user said or clearly implied; never invent availability or budget; map colloquial time phrases to slots ("Thursday evenings" → `thu_eve`, "weekends" → `sat_day, sat_eve, sun_day, sun_eve`); keep asking at most 3 follow-up questions in total, then proceed to review with whatever is known.

Onboarding loop: user message → `extract_preferences` → if `followUpQuestion` and turn count < 4, agent asks it; else move to the review step. Every extracted field is written to `user_preferences` with `field_sources[field] = 'ai_inferred'` until the user confirms it on the review screen, which flips it to `'user_set'`.

### Prompt `agent.chat` (model: smart)
Context given to the model: approved `agent_profiles.summary`, current `user_preferences`, up to 20 prior messages, and tool-style "capabilities" it may request (`suggest_people`, `suggest_events`, `suggest_groups`, `update_preference`). The server executes capabilities deterministically: `suggest_people` calls 03's `GET /matches` logic, `suggest_events` calls 06's `getRecommendedEvents`, `update_preference` writes to `user_preferences` only after the user taps "Apply" on the rendered card. Output is plain text plus an optional `suggestions` array rendered as cards.

### Prompt `agent.explain_recommendation` (model: fast)
Input: the viewing user's sharable preferences, the target (a person's sharable preferences, an event, or a group), and the deterministic score breakdown. Output: `{ explanation: string (≤ 160 chars), highlights: string[] (≤ 3) }`. Must only cite facts present in the input; the server post-checks that each highlight substring appears in the input JSON and drops any that do not.

### Prompt `agent.follow_up_suggestion` (P1, model: smart)
Input: two users' sharable preferences (both must have mutual reconnect interest, verified by 06), the completed event summary. Output: `{ title, description, suggestedSlot, suggestedBusinessCategory }`.

### Coordination boundary

```ts
export async function getSharablePreferences(userId, purpose: 'matching' | 'demand' | 'group_plan'): Promise<SharablePreferences | null>
```
- Returns `null` unless the matching consent flag is true: `matching → allow_matching`, `demand → allow_demand_aggregation`, `group_plan → allow_group_planning`
- Returns `null` if `profiles.is_discoverable = false` and purpose is `matching`
- Never includes `dealbreakers`, `field_sources`, summary text, or any message content
- Logs an `agent_action_log` row `{ actor: 'coordination', action: 'share_preferences', permissions_used: [purpose] }` per call batch (batched per request, not per user, to avoid log spam)

## 6. API

| Route | Body / Response |
|---|---|
| `POST /api/users/onboard` | `{ step: 'basics', neighborhood, coarseLat, coarseLng, travelRadiusKm }` → `{ ok: true }` |
| `POST /api/agent/chat` | `{ conversationId?: string, kind: 'onboarding' \| 'chat', message: string }` → `{ conversationId, reply: string, suggestions?: SuggestionCard[], extracted?: ExtractedPreferences, done?: boolean }` |
| `GET /api/agent/preferences` | → `UserPreferences & { fieldSources }` |
| `PATCH /api/agent/preferences` | partial `UserPreferences` (Zod) → updated row; sets touched fields to `user_set` |
| `POST /api/agent/preferences/confirm` | `{ discoverable: boolean, consent: Consent }` → marks onboarding complete, sets `profiles.onboarding_completed_at` and `is_discoverable` |
| `GET /api/agent/permissions` / `PATCH` | `Consent` object |
| `GET /api/agent/log?limit=50` | agent action log rows for the current user |

All routes use `withAuth`. `POST /api/agent/chat` applies a per-user limit of 30 calls / 10 min and returns `RATE_LIMITED` beyond it.

## 7. UI

### `/onboarding` (Screen 1)
1. **Basics** — neighborhood picker (typeahead over a static SF neighborhood list with coarse centroids), travel radius slider (1–25 km), continue.
2. **Talk to your agent** — chat panel with a warm opener: "Tell me a bit about what you'd like more of in your week." Streaming reply; extracted fields appear live in a side panel ("I heard: pottery, coffee, Thursday evenings, small groups") with a subtle "AI inferred" badge.
3. **Review** — editable chips per field, group size radio, budget slider, availability grid (9 slots), social goals. Below: discoverability toggle and five consent toggles with one-line plain-English descriptions of what each enables and who sees what. Confirm → `/discover`.

### `/agent` (Screen 7)
- Chat with suggestion cards (person card → `/match?focus=<id>`, event card → `/events/<id>`, group card → `/groups/<id>`)
- Right rail (≥1024px) or tabs (mobile): **Preferences** summary with "Edit", **Permissions**, **Activity log** ("Your agent shared your interests and Thursday availability for matching · 2h ago")
- Every suggestion shows its one-line explanation and a "Why this?" disclosure with the highlights

### `/agent/preferences`, `/agent/permissions`
Full editors. Deleting an AI-inferred value removes it from the array and records `field_sources[field] = 'user_set'`.

Accessibility: all toggles are real `<button role="switch">`, chips are removable via keyboard, chat log is an `aria-live="polite"` region.

## 8. Seed Contribution

`supabase/seed/fixtures/preferences.json` for the 14 non-demo seeded users, engineered for the demo:
- 6 users: interests include `pottery` or `ceramics` or `painting`; categories `creative`; slots include `thu_eve`; neighborhoods Mission / Castro / Noe Valley (within 3 km of Kiln & Cup); group size `small`; budget max 2000–3000 cents; all with `allow_matching` and `allow_demand_aggregation` true
- 4 users: `board-games`, `fri_eve`, SoMa / Mission, budget ≤ 1500 (second cluster for Meeple House)
- 4 users: mixed (`hiking`, `coffee`, `live-music`), one with `allow_demand_aggregation: false` to prove opt-out is respected
- Each user also gets `agent_profiles.summary`

## 9. Tests

| Layer | Cases |
|---|---|
| Unit | time-phrase → slot mapping table; Zod rejects unknown enum values; `getSharablePreferences` returns null per consent flag and strips private fields; explanation post-check drops ungrounded highlights; rate limiter |
| Integration (MOCK_AI) | onboarding chat writes `ai_inferred` fields; confirm flips to `user_set` and sets `onboarding_completed_at`; PATCH preferences respects RLS (cannot edit another user); agent log row written when preferences are shared |
| Prompt eval (live key, manual) | 10 transcripts in `tests/evals/agent/*.json` with expected fields; pass ≥ 9/10 on interests, slots, group size |
| E2E | Scene 1: demo user types the canonical sentence → review screen shows pottery, coffee, `thu_eve`, small group → confirm → lands on Discover |

## 10. Acceptance Criteria

1. The Scene 1 sentence produces a review screen containing `pottery`, `coffee`, Thursday evening, and small group, with nothing invented (no budget unless stated).
2. A user can delete any inferred value and the change persists.
3. With `allow_matching = false`, `GET /api/matches` (03) returns the user to nobody and shows nobody to the user; with `allow_demand_aggregation = false`, 04's pipeline never counts the user (verified via a shared integration test fixture).
4. Agent chat suggestion cards deep-link correctly and every card shows a "Why this?" explanation.
5. Activity log shows an entry for each sharing purpose used.

## 11. Independence Notes

- Until 03/06 ship, `suggest_people` / `suggest_events` capabilities use `src/features/agent/server/stubs.ts` returning seeded users/events.
- Fixtures required for `MOCK_AI`: `agent.extract_preferences.json` (the Scene 1 result), `agent.chat.json`, `agent.explain_recommendation.json`, `agent.follow_up_suggestion.json`.

## 12. Risks

| Risk | Mitigation |
|---|---|
| LLM invents preferences (budget, availability) | Schema requires explicit values; system prompt forbids inference beyond the transcript; eval set includes "trap" transcripts; review step always shown |
| Consent checks bypassed by another workstream reading tables directly | RLS limits reads to the owner; service-role reads only in `getSharablePreferences`; code-review rule: grep for `from('user_preferences')` outside `features/agent` fails CI |
| Latency of smart model in onboarding | Stream the reply; show extracted chips progressively; fall back to a form if `AI_UNAVAILABLE` |
