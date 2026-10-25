-- Minimal stand-in for 01's 0100_core.sql (specs/01-core-platform/specs.md §3), used only
-- by the PGlite migration test until 0100_core.sql is on main.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'New member',
  neighborhood text,
  coarse_lat numeric(6,2),
  coarse_lng numeric(6,2),
  is_discoverable boolean not null default false,
  onboarding_completed_at timestamptz,
  updated_at timestamptz not null default now()
);
create table agent_action_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  actor text not null,
  action text not null,
  permissions_used text[] not null default '{}',
  result text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
alter table profiles enable row level security;
alter table agent_action_log enable row level security;
create policy profiles_self on profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy agent_log_self on agent_action_log for select using (auth.uid() = user_id);
