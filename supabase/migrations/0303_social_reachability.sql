-- Workstream 03: enforce in RLS what the API already checks before a connection request: the
-- recipient is discoverable or shares an active group with the requester. Without it a direct
-- PostgREST insert could reach any user whose id leaked (e.g. from an old roster).

-- Answers only for the caller (auth.uid()), like is_blocked_with.
create or replace function public.can_reach(p_other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = p_other and p.is_discoverable)
      or exists (
        select 1
        from public.group_members mine
        join public.group_members theirs on theirs.group_id = mine.group_id
        where mine.user_id = auth.uid() and mine.status = 'active'
          and theirs.user_id = p_other and theirs.status = 'active')
$$;

drop policy conn_insert on public.connections;
create policy conn_insert on public.connections
  for insert to authenticated
  with check (
    auth.uid() = requester_id
    and status = 'pending'
    and not public.is_blocked_with(recipient_id)
    and public.can_reach(recipient_id));
