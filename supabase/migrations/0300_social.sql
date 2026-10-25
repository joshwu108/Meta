-- Workstream 03: connections, safety, groups, invitations, group planner
-- (specs/03-matching-and-groups/specs.md §4). Depends on 0100_core.sql (profiles, set_updated_at()).

-- ---------------------------------------------------------------------------
-- connections: one live edge per unordered pair
-- ---------------------------------------------------------------------------
create table public.connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  message text check (char_length(message) <= 280),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint connections_distinct check (requester_id <> recipient_id)
);
create unique index connections_pair on public.connections
  (least(requester_id, recipient_id), greatest(requester_id, recipient_id));
create index connections_recipient_idx on public.connections (recipient_id, status);
create index connections_requester_idx on public.connections (requester_id, status);

-- ---------------------------------------------------------------------------
-- blocks and reports
-- ---------------------------------------------------------------------------
create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_distinct check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('harassment','spam','fake','safety','other')),
  details text check (char_length(details) <= 1000),
  created_at timestamptz not null default now(),
  constraint reports_distinct check (reporter_id <> reported_id)
);
create index reports_reported_idx on public.reports (reported_id, created_at desc);

-- ---------------------------------------------------------------------------
-- groups, members, invitations
-- ---------------------------------------------------------------------------
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  description text check (char_length(description) <= 1000),
  interests text[] not null default '{}',
  visibility text not null default 'private' check (visibility in ('public','private')),
  kind text not null default 'interest' check (kind in ('interest','private','event')),
  event_id uuid,                                     -- set for kind = 'event' (FK added by 06)
  creator_id uuid not null references public.profiles(id) on delete cascade,
  archived_at timestamptz,                           -- set when the last member (the owner) leaves
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index groups_public_idx on public.groups (visibility, created_at desc) where archived_at is null;

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  status text not null default 'invited' check (status in ('invited','active','removed','left')),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id, status);
-- exactly one active owner per group
create unique index group_members_one_owner on public.group_members (group_id)
  where role = 'owner' and status = 'active';

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('group','event')),
  group_id uuid references public.groups(id) on delete cascade,
  event_id uuid,                                     -- FK added by 06
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','expired')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint invitations_target check (
    (kind = 'group' and group_id is not null) or (kind = 'event' and event_id is not null))
);
create index invitations_recipient_idx on public.invitations (recipient_id, status);
create unique index invitations_one_pending_group on public.invitations (group_id, recipient_id)
  where kind = 'group' and status = 'pending';

-- ---------------------------------------------------------------------------
-- group planner
-- ---------------------------------------------------------------------------
create table public.group_plans (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete set null,
  request_text text not null check (char_length(request_text) between 1 and 500),
  suggestions jsonb not null,                        -- PlanSuggestion[] (spec §5)
  members_included int not null check (members_included >= 0),
  created_at timestamptz not null default now()
);
create index group_plans_group_idx on public.group_plans (group_id, created_at desc);

create table public.group_plan_votes (                 -- P1
  plan_id uuid not null references public.group_plans(id) on delete cascade,
  suggestion_index int not null check (suggestion_index between 0 and 3),
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (plan_id, suggestion_index, user_id)
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger connections_updated before update on public.connections
  for each row execute function public.set_updated_at();
create trigger groups_updated before update on public.groups
  for each row execute function public.set_updated_at();
create trigger group_members_updated before update on public.group_members
  for each row execute function public.set_updated_at();
create trigger invitations_updated before update on public.invitations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS helpers. Security definer so policies on group tables never recurse into themselves.
-- ---------------------------------------------------------------------------
create or replace function public.is_group_member(p_group uuid, p_statuses text[] default array['invited','active'])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group and user_id = auth.uid() and status = any(p_statuses))
$$;

create or replace function public.is_group_admin(p_group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group and user_id = auth.uid() and status = 'active' and role in ('owner','admin'))
$$;

create or replace function public.can_read_group(p_group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.groups g
    where g.id = p_group and g.archived_at is null
      and (g.visibility = 'public' or public.is_group_member(g.id, array['invited','active'])))
$$;

-- Only answers for the caller's own pairs, so it cannot be used to probe other users' blocks.
create or replace function public.is_blocked_with(p_other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = auth.uid() and blocked_id = p_other) or (blocker_id = p_other and blocked_id = auth.uid()))
$$;

-- ---------------------------------------------------------------------------
-- RLS. Writes that span several rows (group creation, invites, removal, leave, block) go through
-- the service-role functions in 0301 after the server checks authorization.
-- ---------------------------------------------------------------------------
alter table public.connections enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.invitations enable row level security;
alter table public.group_plans enable row level security;
alter table public.group_plan_votes enable row level security;

-- connections: either party reads; only the requester inserts (never across a block);
-- only the recipient responds (transitions are checked by the connections_guard trigger)
create policy conn_read on public.connections
  for select to authenticated using (auth.uid() in (requester_id, recipient_id));
create policy conn_insert on public.connections
  for insert to authenticated
  with check (auth.uid() = requester_id and status = 'pending' and not public.is_blocked_with(recipient_id));
create policy conn_respond on public.connections
  for update to authenticated using (auth.uid() = recipient_id) with check (auth.uid() = recipient_id);

create policy blocks_self on public.blocks
  for all to authenticated using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);
create policy reports_insert on public.reports
  for insert to authenticated with check (auth.uid() = reporter_id);

-- groups: public groups readable by every authenticated user; private ones only by invited/active members
create policy groups_read on public.groups
  for select to authenticated using (public.can_read_group(id));
create policy groups_insert on public.groups
  for insert to authenticated with check (auth.uid() = creator_id);
create policy groups_admin_update on public.groups
  for update to authenticated using (public.is_group_admin(id)) with check (public.is_group_admin(id));

create policy members_read on public.group_members
  for select to authenticated using (public.can_read_group(group_id));
-- member writes go through server functions using the admin client after explicit authorization checks

create policy inv_read on public.invitations
  for select to authenticated using (auth.uid() in (sender_id, recipient_id));
create policy inv_respond on public.invitations
  for update to authenticated using (auth.uid() = recipient_id) with check (auth.uid() = recipient_id);

create policy plans_read on public.group_plans
  for select to authenticated using (public.is_group_member(group_id, array['active']));

create policy votes_read on public.group_plan_votes
  for select to authenticated using (
    exists (select 1 from public.group_plans p where p.id = plan_id and public.is_group_member(p.group_id, array['active'])));
create policy votes_insert on public.group_plan_votes
  for insert to authenticated with check (
    auth.uid() = user_id
    and exists (select 1 from public.group_plans p where p.id = plan_id and public.is_group_member(p.group_id, array['active'])));
create policy votes_delete on public.group_plan_votes
  for delete to authenticated using (auth.uid() = user_id);
