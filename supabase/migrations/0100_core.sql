-- Workstream 01: core schema baseline (specs/01-core-platform/specs.md §3)
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user
-- ---------------------------------------------------------------------------
create table public.profiles (
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
comment on table public.profiles is 'Consumer profile. Other users read it only through profile_public_cards.';

-- ---------------------------------------------------------------------------
-- notifications: in-app notifications inserted by notify() with the service role
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,                      -- NOTIFICATION_TYPE enum, checked in app
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_unread_idx on public.notifications (user_id, created_at desc) where read_at is null;
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- agent_action_log: audit of every AI action
-- ---------------------------------------------------------------------------
create table public.agent_action_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,   -- null for system-level runs
  actor text not null,                      -- 'personal_agent' | 'coordination' | 'demand_engine' | 'planning_agent'
  action text not null,                     -- e.g. 'extract_preferences', 'score_matches', 'generate_proposal'
  permissions_used text[] not null default '{}',
  result text not null,                     -- short human-readable summary, no PII
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index agent_action_log_user_idx on public.agent_action_log (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at trigger reused by every workstream
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- auto-create profile on signup
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, is_adult_confirmed)
  values (
    new.id,
    coalesce(nullif(left(new.raw_user_meta_data->>'display_name', 60), ''), 'New member'),
    coalesce((new.raw_user_meta_data->>'is_adult_confirmed')::boolean, false)
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS baseline
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.notifications enable row level security;
alter table public.agent_action_log enable row level security;

-- profiles: self full access; others may read a *public card* only through the view below
create policy profiles_self on public.profiles
  for all to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- security_invoker = false: the view runs as its owner (postgres) so it can read every
-- discoverable profile while exposing only the public card columns.
create view public.profile_public_cards with (security_invoker = false) as
  select id, display_name, avatar_url, bio, neighborhood
  from public.profiles
  where is_discoverable = true;
grant select on public.profile_public_cards to authenticated;
revoke all on public.profile_public_cards from anon;

create policy notifications_self on public.notifications
  for select to authenticated using (auth.uid() = user_id);
create policy notifications_self_update on public.notifications
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- inserts happen with the service role from notify()

create policy agent_log_self on public.agent_action_log
  for select to authenticated using (auth.uid() = user_id);
-- inserts happen with the service role from logAgentAction()

-- ---------------------------------------------------------------------------
-- RLS guard helper used by the CI test: lists public tables without RLS
-- ---------------------------------------------------------------------------
create or replace function public.tables_without_rls() returns setof text
language sql stable security definer set search_path = public as $$
  select c.relname::text
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  order by 1
$$;
revoke all on function public.tables_without_rls() from public, anon, authenticated;
