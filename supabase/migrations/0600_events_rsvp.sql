-- Workstream 06: RSVPs, post-event signals, follow-up suggestions, bookmarks.
-- Depends on 0100 (profiles, set_updated_at) and 0500 (events). 03's tables are optional at apply time.

create table rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'confirmed' check (status in ('confirmed','cancelled','waitlisted')),
  share_with_attendees boolean not null default false,   -- snapshot of consent at RSVP time
  share_with_business boolean not null default false,
  needs_reconfirm boolean not null default false,
  event_version_seen timestamptz,                          -- events.updated_at at (re)confirmation
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id)
);
create index rsvps_user_status on rsvps (user_id, status);
create index rsvps_event_status on rsvps (event_id, status);
create trigger rsvps_updated before update on rsvps for each row execute function set_updated_at();

create table event_feedback (
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  met_someone boolean,
  comment text check (char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table reconnect_interest (
  event_id uuid not null references events(id) on delete cascade,
  from_user_id uuid not null references profiles(id) on delete cascade,
  to_user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, from_user_id, to_user_id),
  check (from_user_id <> to_user_id)
);

create table follow_up_suggestions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  user_a uuid not null references profiles(id) on delete cascade,
  user_b uuid not null references profiles(id) on delete cascade,
  suggestion jsonb not null,            -- { title, description, suggestedSlot, suggestedBusinessCategory, businessId? }
  status text not null default 'suggested' check (status in ('suggested','accepted_a','accepted_b','accepted_both','dismissed')),
  created_at timestamptz not null default now(),
  unique (event_id, user_a, user_b),
  check (user_a < user_b)               -- canonical pair order so the unique key holds for (a,b) and (b,a)
);

create table bookmarks (                 -- P1
  user_id uuid not null references profiles(id) on delete cascade,
  target_type text not null check (target_type in ('event','business')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);

-- Deferred FKs from 03's tables. Guarded so this migration applies whether or not 03 has merged;
-- on a fresh reset 0300 always runs first, so the constraints are created once both are present.
do $$
begin
  if to_regclass('public.groups') is not null then
    alter table groups add constraint groups_event_fk foreign key (event_id) references events(id) on delete set null;
  end if;
  if to_regclass('public.invitations') is not null then
    alter table invitations add constraint invitations_event_fk foreign key (event_id) references events(id) on delete cascade;
  end if;
end $$;

alter table rsvps enable row level security;
alter table event_feedback enable row level security;
alter table reconnect_interest enable row level security;
alter table follow_up_suggestions enable row level security;
alter table bookmarks enable row level security;
create policy rsvp_self on rsvps for select using (auth.uid() = user_id);
create policy feedback_self on event_feedback for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy reconnect_self on reconnect_interest for all using (auth.uid() = from_user_id) with check (auth.uid() = from_user_id);
create policy followup_parties on follow_up_suggestions for select using (auth.uid() in (user_a, user_b));
create policy bookmarks_self on bookmarks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- rsvp inserts/updates go through the functions below (security definer) so capacity is enforced atomically

-- Capacity-safe RSVP. p_allow_waitlist = false (P0) raises CAPACITY_FULL instead of inserting a waitlisted row.
create or replace function rsvp_event(
  p_event_id uuid, p_share_attendees boolean, p_share_business boolean, p_allow_waitlist boolean default false
) returns table (rsvp_status text, event_status text)
language plpgsql security definer set search_path = public as $$
declare v_event events%rowtype; v_confirmed int; v_status text; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_event from events where id = p_event_id for update;        -- row lock serializes RSVPs per event
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_event.status not in ('published','full') then raise exception 'EVENT_NOT_OPEN'; end if;
  if v_event.starts_at < now() then raise exception 'EVENT_STARTED'; end if;
  select count(*) into v_confirmed from rsvps where event_id = p_event_id and status = 'confirmed';
  v_status := case when v_confirmed < v_event.capacity then 'confirmed' else 'waitlisted' end;
  if v_status = 'waitlisted' and not p_allow_waitlist then raise exception 'CAPACITY_FULL'; end if;
  insert into rsvps (event_id, user_id, status, share_with_attendees, share_with_business, event_version_seen)
    values (p_event_id, v_uid, v_status, p_share_attendees, p_share_business, v_event.updated_at)
    on conflict (event_id, user_id) do update set
      status = excluded.status,
      share_with_attendees = excluded.share_with_attendees,
      share_with_business = excluded.share_with_business,
      needs_reconfirm = false,
      event_version_seen = excluded.event_version_seen
    where rsvps.status = 'cancelled';
  if not found then raise exception 'ALREADY_RSVPED'; end if;
  if v_status = 'confirmed' and v_confirmed + 1 >= v_event.capacity then
    update events set status = 'full' where id = p_event_id and status = 'published';
  end if;
  return query select v_status, (select e.status from events e where e.id = p_event_id);
end $$;

-- Cancel my RSVP; promote the oldest waitlisted RSVP into a freed seat; reopen a full event.
create or replace function cancel_rsvp(p_event_id uuid)
returns table (cancelled boolean, promoted_user_id uuid, event_status text)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_promoted uuid;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  perform 1 from events where id = p_event_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  update rsvps set status = 'cancelled'
    where event_id = p_event_id and user_id = v_uid and status in ('confirmed','waitlisted');
  if not found then
    return query select false, null::uuid, (select e.status from events e where e.id = p_event_id);
    return;
  end if;
  update rsvps set status = 'confirmed', needs_reconfirm = false
    where id = (select r.id from rsvps r where r.event_id = p_event_id and r.status = 'waitlisted'
                order by r.created_at, r.id limit 1)
      and (select count(*) from rsvps c where c.event_id = p_event_id and c.status = 'confirmed')
          < (select e.capacity from events e where e.id = p_event_id)
    returning user_id into v_promoted;
  update events set status = 'published' where id = p_event_id and status = 'full'
    and (select count(*) from rsvps where event_id = p_event_id and status = 'confirmed') < capacity;
  return query select true, v_promoted, (select e.status from events e where e.id = p_event_id);
end $$;

-- Clear the reconfirm flag after the attendee accepts the updated details.
create or replace function reconfirm_rsvp(p_event_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  update rsvps r set needs_reconfirm = false, event_version_seen = e.updated_at
    from events e
    where r.event_id = p_event_id and e.id = r.event_id and r.user_id = v_uid and r.status = 'confirmed';
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;

-- Record "I'd like to see them again". Both must hold a confirmed RSVP on a completed event.
-- Returns whether the interest is now mutual.
create or replace function add_reconnect_interest(p_event_id uuid, p_to_user uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_status text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if v_uid = p_to_user then raise exception 'VALIDATION'; end if;
  select status into v_status from events where id = p_event_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_status <> 'completed' then raise exception 'EVENT_NOT_COMPLETED'; end if;
  if (select count(*) from rsvps where event_id = p_event_id and status = 'confirmed'
        and user_id in (v_uid, p_to_user)) < 2 then
    raise exception 'NOT_ATTENDEES';
  end if;
  -- Serialize the pair so two simultaneous taps cannot both miss each other's row.
  perform pg_advisory_xact_lock(hashtextextended(
    p_event_id::text || least(v_uid, p_to_user)::text || greatest(v_uid, p_to_user)::text, 0));
  insert into reconnect_interest (event_id, from_user_id, to_user_id) values (p_event_id, v_uid, p_to_user)
    on conflict do nothing;
  return exists (select 1 from reconnect_interest
                 where event_id = p_event_id and from_user_id = p_to_user and to_user_id = v_uid);
end $$;

-- When a live event's time or price changes, confirmed attendees must reconfirm (06 owns the banner).
create or replace function flag_rsvps_for_reconfirm() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('published','full')
     and (new.starts_at, new.ends_at, new.price_cents) is distinct from (old.starts_at, old.ends_at, old.price_cents) then
    update rsvps set needs_reconfirm = true where event_id = new.id and status = 'confirmed';
  end if;
  return new;
end $$;
create trigger events_flag_reconfirm after update of starts_at, ends_at, price_cents on events
  for each row execute function flag_rsvps_for_reconfirm();
