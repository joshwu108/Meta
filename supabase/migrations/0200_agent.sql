-- Workstream 02: personal agent, preferences, consent, conversations.
-- Depends on 0100_core.sql (profiles, set_updated_at()).

create table user_preferences (
  user_id uuid primary key references profiles(id) on delete cascade,
  interests text[] not null default '{}',             -- lowercase kebab tags, e.g. 'pottery','board-games'
  interest_categories text[] not null default '{}',   -- EVENT_CATEGORY values derived from interests
  availability_slots text[] not null default '{}',    -- AVAILABILITY_SLOT values
  social_goals text[] not null default '{}',          -- SOCIAL_GOAL values
  group_size_pref text check (group_size_pref in ('one_on_one','small','medium','large')),
  budget_min_cents int check (budget_min_cents >= 0),
  budget_max_cents int check (budget_max_cents >= 0),
  travel_radius_km numeric(4,1) not null default 5 check (travel_radius_km between 1 and 25),
  activity_prefs text[] not null default '{}',
  dealbreakers text[] not null default '{}',
  field_sources jsonb not null default '{}',          -- { "interests": "ai_inferred" | "user_set", ... }
  updated_at timestamptz not null default now(),
  check (budget_min_cents is null or budget_max_cents is null or budget_min_cents <= budget_max_cents)
);

create table agent_profiles (
  user_id uuid primary key references profiles(id) on delete cascade,
  summary text,
  consent jsonb not null default '{"allow_matching": false, "allow_demand_aggregation": false, "allow_group_planning": false, "share_interests_with_attendees": false, "share_name_with_business": false}',
  consent_updated_at timestamptz,
  feedback_notes jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

create table agent_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('onboarding','chat')),
  created_at timestamptz not null default now()
);
create index on agent_conversations (user_id, kind, created_at desc);

create table agent_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references agent_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  suggestions jsonb,
  created_at timestamptz not null default now()
);
create index on agent_messages (conversation_id, created_at);

create trigger user_preferences_updated before update on user_preferences
  for each row execute function set_updated_at();
create trigger agent_profiles_updated before update on agent_profiles
  for each row execute function set_updated_at();

alter table user_preferences enable row level security;
alter table agent_profiles enable row level security;
alter table agent_conversations enable row level security;
alter table agent_messages enable row level security;

create policy prefs_self on user_preferences for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy agent_self on agent_profiles for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy conv_self on agent_conversations for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy msg_self on agent_messages for all
  using (exists (select 1 from agent_conversations c where c.id = conversation_id and c.user_id = auth.uid()))
  with check (exists (select 1 from agent_conversations c where c.id = conversation_id and c.user_id = auth.uid()));
