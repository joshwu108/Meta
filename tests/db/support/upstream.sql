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

-- 02 agent
create table user_preferences (
  user_id uuid primary key references profiles(id) on delete cascade,
  interests text[] not null default '{}',
  interest_categories text[] not null default '{}',
  availability_slots text[] not null default '{}',
  social_goals text[] not null default '{}',
  group_size_pref text,
  budget_min_cents int,
  budget_max_cents int,
  travel_radius_km numeric(4,1) not null default 5,
  activity_prefs text[] not null default '{}',
  dealbreakers text[] not null default '{}',
  field_sources jsonb not null default '{}'
);
create table agent_profiles (
  user_id uuid primary key references profiles(id) on delete cascade,
  summary text,
  feedback_notes jsonb not null default '[]',
  consent jsonb not null default '{"allow_matching": false, "allow_demand_aggregation": false, "allow_group_planning": false, "share_interests_with_attendees": false, "share_name_with_business": false}'
);

-- 03 social: table DDL copied from main's 0300_social.sql (policies and functions omitted)
create table connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references profiles(id) on delete cascade,
  recipient_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  message text check (char_length(message) <= 280),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint connections_distinct check (requester_id <> recipient_id)
);
create table blocks (
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_distinct check (blocker_id <> blocked_id)
);
create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  description text check (char_length(description) <= 1000),
  interests text[] not null default '{}',
  visibility text not null default 'private' check (visibility in ('public','private')),
  kind text not null default 'interest' check (kind in ('interest','private','event')),
  event_id uuid,                                     -- set for kind = 'event' (FK added by 06)
  creator_id uuid not null references profiles(id) on delete cascade,
  archived_at timestamptz,                           -- set when the last member (the owner) leaves
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table group_members (
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  status text not null default 'invited' check (status in ('invited','active','removed','left')),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create table invitations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('group','event')),
  group_id uuid references groups(id) on delete cascade,
  event_id uuid,                                     -- FK added by 06
  sender_id uuid not null references profiles(id) on delete cascade,
  recipient_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','expired')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint invitations_target check (
    (kind = 'group' and group_id is not null) or (kind = 'event' and event_id is not null))
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
  proposal_id uuid,                             -- references event_proposals(id); FK added below if 04 landed first
  source text not null check (source in ('ai_proposal','business_manual','group_request')),
  title text not null check (char_length(title) between 4 and 80),
  description text not null check (char_length(description) <= 1500),
  category text not null,
  format text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity int not null check (capacity between 1 and 500),
  price_cents int check (price_cents >= 0),     -- null = free / pay at venue
  status text not null default 'approved_draft'
    check (status in ('proposed','awaiting_approval','approved_draft','published','full','completed','cancelled')),
  published_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_time check (ends_at > starts_at),
  constraint events_cancel_reason check (status <> 'cancelled' or cancel_reason is not null)
);
create trigger events_updated before update on events for each row execute function set_updated_at();

-- 05 event status machine, copied from ws/05-business (0500_business.sql, 0501_business_rpc.sql
-- after 0ad45d9) so 06's tests fail the same way production would on a direct status UPDATE.
-- Only deviation: is_trusted_server() drops 05's `session_user in ('postgres', ...)` clause,
-- because every test session connects as the local superuser. What remains models PostgREST:
-- a service-role request is trusted, a signed-in user's request is not.
create or replace function is_trusted_server() returns boolean
language sql stable as $$
  select coalesce(
           nullif(current_setting('request.jwt.claim.role', true), ''),
           nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
           ''
         ) = 'service_role';
$$;

create or replace function events_guard_status() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status
     and coalesce(current_setting('commonground.status_rpc', true), '') <> 'on' then
    raise exception
      'event status changes must go through a status RPC (attempted % -> %)', old.status, new.status
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger events_status_guard before update on events
  for each row execute function events_guard_status();

create or replace function event_transition_allowed(p_from text, p_to text)
returns boolean language sql immutable as $$
  select case p_from
    when 'proposed'           then p_to = 'awaiting_approval'
    when 'awaiting_approval'  then p_to in ('approved_draft','cancelled')
    when 'approved_draft'     then p_to in ('published','cancelled')
    when 'published'          then p_to in ('full','completed','cancelled')
    when 'full'               then p_to in ('published','completed','cancelled')
    else false
  end;
$$;

create or replace function can_act_on_business(p_business_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_trusted_server()
      or exists (
           select 1 from businesses b
            where b.id = p_business_id and b.owner_id = auth.uid()
         );
$$;

create or replace function transition_event_status(p_event_id uuid, p_to text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_event record;
begin
  select * into v_event from events where id = p_event_id for update;
  if not found then
    raise exception 'NOT_FOUND: event does not exist' using errcode = 'no_data_found';
  end if;
  -- An owner who does not own this event is told the same thing as a stranger.
  if not can_act_on_business(v_event.business_id) then
    raise exception 'NOT_FOUND: event does not exist' using errcode = 'no_data_found';
  end if;
  if v_event.status = p_to then
    raise exception 'CONFLICT: event is already %', p_to using errcode = 'unique_violation';
  end if;
  if not event_transition_allowed(v_event.status, p_to) then
    raise exception 'CONFLICT: % -> % is not a legal event transition', v_event.status, p_to
      using errcode = 'check_violation';
  end if;

  perform set_config('commonground.status_rpc', 'on', true);
  update events
     set status       = p_to,
         published_at = case when p_to = 'published' and published_at is null then now() else published_at end,
         cancelled_at = case when p_to = 'cancelled' then now() else cancelled_at end
   where id = p_event_id;
  perform set_config('commonground.status_rpc', '', true);

  return jsonb_build_object('eventId', p_event_id, 'from', v_event.status, 'to', p_to);
end;
$$;

