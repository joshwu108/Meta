-- 0500_business.sql — workstream 05 (Business Application)
--
-- Owns: businesses, business_capabilities, events.
-- Owns the only code path that moves an event to 'published': nothing AI-generated
-- becomes a real event without a business owner approving the final details.
--
-- Workstream 06 adds rsvps and drives the 'full' / 'completed' transitions through
-- transition_event_status(); 05 owns every other transition.

create extension if not exists "pgcrypto";

-- Shared updated_at trigger. Workstream 01 ships the same function in 0100_core.sql;
-- `create or replace` makes whichever migration runs second a no-op.
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------- businesses

create table businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique,
  description text check (char_length(description) <= 1000),
  category text not null,                       -- primary EVENT_CATEGORY, e.g. 'creative'
  address text not null,
  neighborhood text,
  lat numeric(9,6) not null,                    -- exact venue location is public information
  lng numeric(9,6) not null,
  image_url text,
  hours jsonb not null default '{}',            -- { "mon": [["09:00","21:00"]], ... }
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index businesses_owner on businesses (owner_id);   -- MVP: one business per owner
create index businesses_geo on businesses (lat, lng) where is_active;

create trigger businesses_updated_at before update on businesses
  for each row execute function set_updated_at();

create table business_capabilities (
  business_id uuid primary key references businesses(id) on delete cascade,
  event_categories text[] not null default '{}',  -- EVENT_CATEGORY values it can host
  capacity int not null check (capacity between 1 and 500),
  min_price_cents int check (min_price_cents >= 0),
  max_price_cents int check (max_price_cents >= 0),
  hosting_slots text[] not null default '{}',     -- AVAILABILITY_SLOT values
  equipment_tags text[] not null default '{}',    -- 'pottery-wheels','kiln','board-game-library','espresso-bar'
  formats text[] not null default '{}',           -- 'workshop','social-mixer','tournament','tasting'
  notes text check (char_length(notes) <= 500),
  accepts_ai_proposals boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint capabilities_price_order check (
    min_price_cents is null or max_price_cents is null or max_price_cents >= min_price_cents
  )
);

create trigger business_capabilities_updated_at before update on business_capabilities
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------- events

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
create index events_status_starts on events (status, starts_at);
create index events_business_starts on events (business_id, starts_at desc);
create unique index events_proposal on events (proposal_id) where proposal_id is not null;

create trigger events_updated_at before update on events
  for each row execute function set_updated_at();

-- ------------------------------------------------- event status machine guard
--
-- Spec section 12: the status machine must not be bypassable by a direct UPDATE from an
-- owner's session. Only the SECURITY DEFINER RPCs below set `commonground.status_rpc`,
-- so any other UPDATE that changes `status` is rejected.

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

-- Legal transitions, mirrored in src/features/business/server/status-machine.ts.
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

-- ---------------------------------------------------------------- RLS

alter table businesses enable row level security;
alter table business_capabilities enable row level security;
alter table events enable row level security;

create policy biz_public_read on businesses for select using (is_active);
create policy biz_owner_write on businesses for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy cap_owner on business_capabilities for all
  using (exists (select 1 from businesses b where b.id = business_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from businesses b where b.id = business_id and b.owner_id = auth.uid()));
create policy cap_public_read on business_capabilities for select using (true);
create policy events_public_read on events for select
  using (status in ('published','full','completed'));
create policy events_owner_all on events for all
  using (exists (select 1 from businesses b where b.id = business_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from businesses b where b.id = business_id and b.owner_id = auth.uid()));

-- -------------------------------------------- FK to 04's event_proposals table
--
-- Spec section 12: whichever of 0400 / 0500 lands second adds the pair of FKs.
-- Guarded so a reset works with 04 absent (05 developing alone) or present.

do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'event_proposals') then
    if not exists (select 1 from pg_constraint where conname = 'proposals_business_fk') then
      alter table event_proposals
        add constraint proposals_business_fk
        foreign key (business_id) references businesses(id) on delete cascade;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'events_proposal_fk') then
      alter table events
        add constraint events_proposal_fk
        foreign key (proposal_id) references event_proposals(id) on delete set null;
    end if;
  end if;
end;
$$;
