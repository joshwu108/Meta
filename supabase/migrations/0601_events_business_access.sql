-- Workstream 06: business-facing reads of RSVPs.
-- `rsvps` RLS only lets users read their own rows, and businesses never read `profiles`
-- (README §3 invariant 1). These functions give a venue owner exactly what 05 §3 allows:
-- counts always, names only for attendees who chose to share with the venue.

-- Attendees of one of the caller's events: status plus display name when consented.
create or replace function business_event_attendees(p_event_id uuid)
returns table (status text, display_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (
    select 1 from events e join businesses b on b.id = e.business_id
     where e.id = p_event_id and b.owner_id = auth.uid()
  ) then
    raise exception 'NOT_FOUND: event does not exist' using errcode = 'no_data_found';
  end if;
  return query
    select r.status, case when r.share_with_business then p.display_name end
      from rsvps r join profiles p on p.id = r.user_id
     where r.event_id = p_event_id and r.status in ('confirmed', 'waitlisted')
     order by r.status, r.created_at;
end $$;

-- Confirmed / waitlisted counts for the caller's events; other businesses' events are skipped.
create or replace function business_event_rsvp_counts(p_event_ids uuid[])
returns table (event_id uuid, confirmed int, waitlisted int)
language sql stable security definer set search_path = public as $$
  select e.id,
         (count(r.*) filter (where r.status = 'confirmed'))::int,
         (count(r.*) filter (where r.status = 'waitlisted'))::int
    from events e
    join businesses b on b.id = e.business_id and b.owner_id = auth.uid()
    left join rsvps r on r.event_id = e.id
   where e.id = any(p_event_ids)
   group by e.id;
$$;

revoke all on function business_event_attendees(uuid) from public;
revoke all on function business_event_rsvp_counts(uuid[]) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function business_event_attendees(uuid) to authenticated;
    grant execute on function business_event_rsvp_counts(uuid[]) to authenticated;
  end if;
end $$;
