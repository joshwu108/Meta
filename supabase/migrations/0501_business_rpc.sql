-- 0501_business_rpc.sql — workstream 05 transactional RPCs
--
-- Every event status change and every proposal decision happens inside one of these
-- functions. They are SECURITY DEFINER (RLS is bypassed) so each one checks ownership
-- itself, and they are the only callers allowed to set `commonground.status_rpc`.
--
-- Error convention: exceptions are raised as '<ERROR_CODE>: <message>' where ERROR_CODE is
-- one of the API envelope codes in specs/README.md section 4. src/lib/api/rpc-error.ts maps
-- the prefix back to the envelope so a client never sees a Postgres message.

-- ------------------------------------------------------------- trust helpers

create or replace function is_trusted_server() returns boolean
language sql stable as $$
  select coalesce(
           nullif(current_setting('request.jwt.claim.role', true), ''),
           nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
           ''
         ) = 'service_role'
      or current_user in ('postgres', 'supabase_admin', 'service_role');
$$;

create or replace function can_act_on_business(p_business_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_trusted_server()
      or exists (
           select 1 from businesses b
            where b.id = p_business_id and b.owner_id = auth.uid()
         );
$$;

-- ------------------------------------------------------- event status changes

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

create or replace function publish_event(p_event_id uuid) returns jsonb
language sql security definer set search_path = public as $$
  select transition_event_status(p_event_id, 'published');
$$;

create or replace function cancel_event(p_event_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_business uuid;
  v_status text;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'VALIDATION: a cancellation reason is required' using errcode = 'check_violation';
  end if;

  select business_id, status into v_business, v_status from events where id = p_event_id;
  if not found or not can_act_on_business(v_business) then
    raise exception 'NOT_FOUND: event does not exist' using errcode = 'no_data_found';
  end if;
  if v_status not in ('approved_draft', 'published', 'full') then
    raise exception 'CONFLICT: a % event cannot be cancelled', v_status using errcode = 'check_violation';
  end if;

  perform set_config('commonground.status_rpc', 'on', true);
  update events set cancel_reason = p_reason where id = p_event_id;
  perform set_config('commonground.status_rpc', '', true);

  return transition_event_status(p_event_id, 'cancelled');
end;
$$;

-- -------------------------------------------------------- proposal decisions
--
-- One transaction: the proposal row is locked, the event is inserted, and the proposal is
-- marked decided. Any failure rolls all of it back, so a proposal can never end up
-- 'approved' without the event it points at (spec section 9, integration test T-I2).
--
-- p_event carries the already-merged and already-validated event fields
-- (proposal document + business edits), resolved in decideProposal() so the capability
-- checks stay unit-testable in TypeScript.

create or replace function decide_proposal(
  p_proposal_id uuid,
  p_decision    text,
  p_edits       jsonb default null,
  p_note        text  default null,
  p_event       jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_proposal record;
  v_event_id uuid;
  v_status   text;
begin
  if p_decision not in ('approve', 'modify', 'reject') then
    raise exception 'VALIDATION: unknown decision %', p_decision using errcode = 'check_violation';
  end if;

  select * into v_proposal from event_proposals where id = p_proposal_id for update;
  if not found or not can_act_on_business(v_proposal.business_id) then
    raise exception 'NOT_FOUND: proposal does not exist' using errcode = 'no_data_found';
  end if;
  if v_proposal.status <> 'pending' then
    raise exception 'CONFLICT: proposal was already %', v_proposal.status using errcode = 'unique_violation';
  end if;

  if p_decision = 'reject' then
    update event_proposals
       set status = 'rejected', decision_note = p_note, decided_at = now()
     where id = p_proposal_id;
    return jsonb_build_object('proposalId', p_proposal_id, 'status', 'rejected', 'eventId', null);
  end if;

  if p_event is null then
    raise exception 'VALIDATION: approving a proposal requires resolved event fields'
      using errcode = 'check_violation';
  end if;

  insert into events (
    business_id, proposal_id, source, title, description, category, format,
    starts_at, ends_at, capacity, price_cents, status
  ) values (
    v_proposal.business_id, p_proposal_id, 'ai_proposal',
    p_event ->> 'title', p_event ->> 'description', p_event ->> 'category',
    nullif(p_event ->> 'format', ''),
    (p_event ->> 'startsAt')::timestamptz, (p_event ->> 'endsAt')::timestamptz,
    (p_event ->> 'capacity')::int,
    case when p_event ->> 'priceCents' is null then null else (p_event ->> 'priceCents')::int end,
    'approved_draft'
  ) returning id into v_event_id;

  v_status := case p_decision when 'approve' then 'approved' else 'modified' end;
  update event_proposals
     set status             = v_status,
         decision_note      = p_note,
         decided_at         = now(),
         business_edits     = p_edits,
         resulting_event_id = v_event_id
   where id = p_proposal_id;

  return jsonb_build_object('proposalId', p_proposal_id, 'status', v_status, 'eventId', v_event_id);
end;
$$;

-- ------------------------------------------- venue search for workstream 04

create or replace function haversine_km(
  lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric
) returns numeric
language sql immutable as $$
  select (6371 * 2 * asin(sqrt(
           power(sin(radians(lat2 - lat1) / 2), 2) +
           cos(radians(lat1)) * cos(radians(lat2)) *
           power(sin(radians(lng2 - lng1) / 2), 2)
         )))::numeric;
$$;

-- Prefilter only (spec section 5): is_active, accepts_ai_proposals, category, capacity,
-- radius. Scoring and the top-5 cut live in findCandidateBusinesses(); 04 owns the weights.
create or replace function business_candidates(
  p_category    text,
  p_cohort_size int,
  p_lat         numeric,
  p_lng         numeric,
  p_radius_km   numeric
) returns table (
  business_id      uuid,
  name             text,
  category         text,
  neighborhood     text,
  address          text,
  description      text,
  image_url        text,
  hours            jsonb,
  capacity         int,
  event_categories text[],
  hosting_slots    text[],
  equipment_tags   text[],
  formats          text[],
  min_price_cents  int,
  max_price_cents  int,
  distance_km      numeric
)
language sql stable security definer set search_path = public as $$
  select b.id, b.name, b.category, coalesce(b.neighborhood, ''), b.address,
         coalesce(b.description, ''), b.image_url, b.hours,
         c.capacity, c.event_categories, c.hosting_slots, c.equipment_tags, c.formats,
         c.min_price_cents, c.max_price_cents,
         round(haversine_km(p_lat, p_lng, b.lat, b.lng), 3)
    from businesses b
    join business_capabilities c on c.business_id = b.id
   where b.is_active
     and c.accepts_ai_proposals
     and p_category = any (c.event_categories)
     and c.capacity >= p_cohort_size
     and haversine_km(p_lat, p_lng, b.lat, b.lng) <= p_radius_km
   order by 16 asc, b.name asc;
$$;

revoke all on function decide_proposal(uuid, text, jsonb, text, jsonb) from public;
revoke all on function transition_event_status(uuid, text) from public;
revoke all on function cancel_event(uuid, text) from public;
revoke all on function publish_event(uuid) from public;
grant execute on function decide_proposal(uuid, text, jsonb, text, jsonb) to authenticated, service_role;
grant execute on function transition_event_status(uuid, text) to authenticated, service_role;
grant execute on function cancel_event(uuid, text) to authenticated, service_role;
grant execute on function publish_event(uuid) to authenticated, service_role;
grant execute on function business_candidates(text, int, numeric, numeric, numeric) to authenticated, service_role, anon;
