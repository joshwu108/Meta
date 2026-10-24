-- Test-only stand-ins for tables other workstreams own, copied from their specs so 06's
-- migration can be exercised on plain Postgres before 01/02/03/05 merge. Not a migration.

create extension if not exists "pgcrypto";

-- Supabase auth shim: auth.uid() reads the JWT subject the same way Supabase does.
create schema if not exists auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}');
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- 01 core
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_url text,
  bio text,
  neighborhood text,
  coarse_lat numeric(6,2),
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
  type text not null,
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- 02 agent (consent only)
create table agent_profiles (
  user_id uuid primary key references profiles(id) on delete cascade,
  consent jsonb not null default '{"allow_matching": false, "allow_demand_aggregation": false, "allow_group_planning": false, "share_interests_with_attendees": false, "share_name_with_business": false}'
);

-- 03 social
create table connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references profiles(id) on delete cascade,
  recipient_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now()
);
create table blocks (
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  primary key (blocker_id, blocked_id)
);
create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  visibility text not null default 'private',
  kind text not null default 'interest',
  event_id uuid,
  creator_id uuid not null references profiles(id)
);
create table group_members (
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member',
  status text not null default 'invited',
  primary key (group_id, user_id)
);
create table invitations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('group','event')),
  group_id uuid references groups(id) on delete cascade,
  event_id uuid,
  sender_id uuid not null references profiles(id),
  recipient_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

-- 05 business
create table businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null unique,
  description text,
  category text not null,
  address text not null,
  neighborhood text,
  lat numeric(9,6) not null,
  lng numeric(9,6) not null,
  image_url text,
  is_active boolean not null default true
);
create table events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  proposal_id uuid,
  source text not null check (source in ('ai_proposal','business_manual','group_request')),
  title text not null,
  description text not null,
  category text not null,
  format text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity int not null check (capacity between 1 and 500),
  price_cents int,
  status text not null default 'approved_draft'
    check (status in ('proposed','awaiting_approval','approved_draft','published','full','completed','cancelled')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_time check (ends_at > starts_at)
);
create trigger events_updated before update on events for each row execute function set_updated_at();
