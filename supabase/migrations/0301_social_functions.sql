-- Workstream 03: guard triggers and service-role functions for the social graph.
-- Guards keep invariants even for writes that reach PostgREST directly; the functions run
-- multi-row writes atomically and are callable only with the service role, after the server
-- has checked authorization (specs/03-matching-and-groups/specs.md §4 RLS note).

-- ---------------------------------------------------------------------------
-- connections: immutable parties/message; pending → accepted|declined, accepted → declined
-- ---------------------------------------------------------------------------
create or replace function public.connections_guard() returns trigger
language plpgsql as $$
begin
  if new.requester_id <> old.requester_id or new.recipient_id <> old.recipient_id
     or new.created_at <> old.created_at or new.message is distinct from old.message then
    raise exception 'CONNECTION_IMMUTABLE';
  end if;
  if new.status <> old.status then
    if not ((old.status = 'pending' and new.status in ('accepted','declined'))
            or (old.status = 'accepted' and new.status = 'declined')) then
      raise exception 'CONNECTION_TRANSITION';
    end if;
    if old.status = 'pending' then
      new.responded_at := now();
    end if;
  end if;
  return new;
end $$;

create trigger connections_guard before update on public.connections
  for each row execute function public.connections_guard();

-- ---------------------------------------------------------------------------
-- groups: users (admins via RLS) may only edit the descriptive columns
-- ---------------------------------------------------------------------------
create or replace function public.groups_guard() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and (
       new.creator_id <> old.creator_id or new.kind <> old.kind
       or new.event_id is distinct from old.event_id
       or new.archived_at is distinct from old.archived_at
       or new.created_at <> old.created_at) then
    raise exception 'GROUP_IMMUTABLE';
  end if;
  return new;
end $$;

create trigger groups_guard before update on public.groups
  for each row execute function public.groups_guard();

-- ---------------------------------------------------------------------------
-- invitations: only pending ones change; answering a group invitation updates the membership
-- in the same statement (accept → active, decline → left, expire → removed)
-- ---------------------------------------------------------------------------
create or replace function public.invitations_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind <> old.kind or new.group_id is distinct from old.group_id
     or new.event_id is distinct from old.event_id or new.sender_id <> old.sender_id
     or new.recipient_id <> old.recipient_id or new.created_at <> old.created_at then
    raise exception 'INVITATION_IMMUTABLE';
  end if;
  if new.status = old.status then
    return new;
  end if;
  if old.status <> 'pending' then
    raise exception 'INVITATION_NOT_PENDING';
  end if;
  new.responded_at := now();
  if new.kind <> 'group' then
    return new;
  end if;
  if new.status = 'accepted' then
    if exists (select 1 from public.groups g where g.id = new.group_id and g.archived_at is not null) then
      raise exception 'INVITATION_STALE';
    end if;
    update public.group_members set status = 'active', joined_at = now()
      where group_id = new.group_id and user_id = new.recipient_id and status = 'invited';
    if not found then
      raise exception 'INVITATION_STALE';
    end if;
  else
    update public.group_members
      set status = case when new.status = 'declined' then 'left' else 'removed' end
      where group_id = new.group_id and user_id = new.recipient_id and status = 'invited';
  end if;
  return new;
end $$;

create trigger invitations_guard before update on public.invitations
  for each row execute function public.invitations_guard();

-- ---------------------------------------------------------------------------
-- Service-role functions
-- ---------------------------------------------------------------------------

/* Create a group and make the creator its active owner. */
create or replace function public.create_group_with_owner(
  p_creator uuid, p_name text, p_description text, p_interests text[], p_visibility text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_group uuid;
begin
  insert into public.groups (name, description, interests, visibility, kind, creator_id)
    values (p_name, p_description, coalesce(p_interests, '{}'), p_visibility,
            case when p_visibility = 'public' then 'interest' else 'private' end, p_creator)
    returning id into v_group;
  insert into public.group_members (group_id, user_id, role, status, joined_at)
    values (v_group, p_creator, 'owner', 'active', now());
  return v_group;
end $$;

/* Invite users: (re)open their membership as 'invited' and create one pending invitation each.
   Users who are already invited or active are skipped (no row returned for them). */
create or replace function public.invite_to_group(p_group uuid, p_sender uuid, p_recipients uuid[])
returns table (invitation_id uuid, invitee_id uuid)
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.groups where id = p_group and archived_at is null for update;
  if not found then
    raise exception 'GROUP_NOT_FOUND';
  end if;
  return query
  with targets as (
    select distinct r as user_id from unnest(p_recipients) as r where r <> p_sender
  ), opened as (
    insert into public.group_members as m (group_id, user_id, role, status, joined_at)
    select p_group, t.user_id, 'member', 'invited', null from targets t
    on conflict (group_id, user_id) do update set status = 'invited', role = 'member', joined_at = null
      where m.status in ('removed', 'left')
    returning m.user_id
  ), created as (
    insert into public.invitations as i (kind, group_id, sender_id, recipient_id)
    select 'group', p_group, p_sender, o.user_id from opened o
    returning i.id, i.recipient_id
  )
  select c.id, c.recipient_id from created c;
end $$;

/* Remove an invited or active member (never the owner) and expire their pending invitation. */
create or replace function public.remove_group_member(p_group uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.groups where id = p_group for update;
  update public.group_members set status = 'removed'
    where group_id = p_group and user_id = p_user and status in ('invited', 'active') and role <> 'owner';
  if not found then
    raise exception 'MEMBER_NOT_REMOVABLE';
  end if;
  update public.invitations set status = 'expired'
    where kind = 'group' and group_id = p_group and recipient_id = p_user and status = 'pending';
end $$;

/* Leave a group. The owner may leave only as the last active member, which archives the group. */
create or replace function public.leave_group(p_group uuid, p_user uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_status text;
begin
  perform 1 from public.groups where id = p_group and archived_at is null for update;
  if not found then
    raise exception 'GROUP_NOT_FOUND';
  end if;
  select role, status into v_role, v_status from public.group_members
    where group_id = p_group and user_id = p_user;
  if v_status is distinct from 'active' then
    raise exception 'NOT_ACTIVE_MEMBER';
  end if;
  if v_role = 'owner' and exists (
       select 1 from public.group_members
       where group_id = p_group and user_id <> p_user and status = 'active') then
    raise exception 'OWNER_MUST_TRANSFER';
  end if;
  update public.group_members set status = 'left' where group_id = p_group and user_id = p_user;
  if v_role <> 'owner' then
    return 'left';
  end if;
  update public.invitations set status = 'expired'
    where kind = 'group' and group_id = p_group and status = 'pending';
  update public.groups set archived_at = now() where id = p_group;
  return 'archived';
end $$;

/* Hand ownership to another active member; the previous owner becomes an admin. */
create or replace function public.transfer_group_owner(p_group uuid, p_from uuid, p_to uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.groups where id = p_group and archived_at is null for update;
  if not found then
    raise exception 'GROUP_NOT_FOUND';
  end if;
  if not exists (select 1 from public.group_members
                 where group_id = p_group and user_id = p_from and role = 'owner' and status = 'active') then
    raise exception 'NOT_OWNER';
  end if;
  if p_to = p_from or not exists (select 1 from public.group_members
                                  where group_id = p_group and user_id = p_to and status = 'active') then
    raise exception 'TRANSFER_TARGET_INVALID';
  end if;
  update public.group_members set role = 'admin' where group_id = p_group and user_id = p_from;
  update public.group_members set role = 'owner' where group_id = p_group and user_id = p_to;
end $$;

/* Block: record it, end any pending or accepted connection between the pair, and expire pending
   invitations between them (event invitations either way; group invitations into private groups
   where the other person is an active member). */
create or replace function public.block_user(p_blocker uuid, p_blocked uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_blocker = p_blocked then
    raise exception 'BLOCK_SELF';
  end if;
  insert into public.blocks (blocker_id, blocked_id) values (p_blocker, p_blocked)
    on conflict do nothing;
  update public.connections set status = 'declined'
    where least(requester_id, recipient_id) = least(p_blocker, p_blocked)
      and greatest(requester_id, recipient_id) = greatest(p_blocker, p_blocked)
      and status in ('pending', 'accepted');
  update public.invitations i set status = 'expired'
    where i.status = 'pending'
      and (
        (i.kind = 'event' and ((i.sender_id = p_blocker and i.recipient_id = p_blocked)
                               or (i.sender_id = p_blocked and i.recipient_id = p_blocker)))
        or (i.kind = 'group'
            and exists (select 1 from public.groups g where g.id = i.group_id and g.visibility = 'private')
            and ((i.recipient_id = p_blocked and exists (select 1 from public.group_members m
                   where m.group_id = i.group_id and m.user_id = p_blocker and m.status = 'active'))
              or (i.recipient_id = p_blocker and exists (select 1 from public.group_members m
                   where m.group_id = i.group_id and m.user_id = p_blocked and m.status = 'active')))));
end $$;

revoke all on function public.create_group_with_owner(uuid, text, text, text[], text) from public, anon, authenticated;
revoke all on function public.invite_to_group(uuid, uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.remove_group_member(uuid, uuid) from public, anon, authenticated;
revoke all on function public.leave_group(uuid, uuid) from public, anon, authenticated;
revoke all on function public.transfer_group_owner(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.block_user(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_group_with_owner(uuid, text, text, text[], text) to service_role;
grant execute on function public.invite_to_group(uuid, uuid, uuid[]) to service_role;
grant execute on function public.remove_group_member(uuid, uuid) to service_role;
grant execute on function public.leave_group(uuid, uuid) to service_role;
grant execute on function public.transfer_group_owner(uuid, uuid, uuid) to service_role;
grant execute on function public.block_user(uuid, uuid) to service_role;
