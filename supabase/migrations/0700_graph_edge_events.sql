-- Workstream 07: provenance log behind the connection graph
-- (specs/07-connection-graph/specs.md §3). Depends on 0100_core.sql (profiles) and
-- 0300_social.sql (connections, groups, invitations, is_blocked_with()).
--
-- The graph's nodes and edges are derived from tables that already exist. What no existing table
-- can answer is *how* an edge came to be — the agent suggested it, someone sent a request, a group
-- put two people in the same room — so that story is appended here, one row per moment.

create table public.graph_edge_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null references public.profiles(id) on delete cascade,
  -- Normalized pair, so a pair reads the same whichever side acted.
  pair_lo uuid generated always as (least(actor_id, subject_id)) stored,
  pair_hi uuid generated always as (greatest(actor_id, subject_id)) stored,
  kind text not null check (kind in (
    'agent_suggested','request_sent','accepted','declined',
    'group_joined','co_attended','message_exchanged','left')),
  source text not null check (source in ('agent','user','group','event')),
  ref_table text check (ref_table in ('connections','groups','events')),
  ref_id uuid,                                      -- the row that caused it, when there is one
  weight numeric(4,3) not null default 0.1 check (weight >= 0 and weight <= 1),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint graph_edge_events_distinct check (actor_id <> subject_id)
);
comment on table public.graph_edge_events is
  'Append-only provenance of the connection graph. Service-role writes only; each side reads its own pairs.';
comment on column public.graph_edge_events.weight is
  'Strength contribution in [0,1], decayed by age when an edge is drawn. Never shown as a number.';

create index graph_edge_events_actor_idx on public.graph_edge_events (actor_id, created_at desc);
create index graph_edge_events_subject_idx on public.graph_edge_events (subject_id, created_at desc);
create index graph_edge_events_pair_idx on public.graph_edge_events (pair_lo, pair_hi, created_at desc);
create index graph_edge_events_ref_idx on public.graph_edge_events (kind, ref_id) where ref_id is not null;

-- ---------------------------------------------------------------------------
-- RLS: the two people a row is about may read it, and only while neither has blocked the other.
-- There is no insert, update or delete policy: writes go through recordGraphEvent() with the
-- service role, after the social action itself has been authorized and committed.
-- ---------------------------------------------------------------------------
alter table public.graph_edge_events enable row level security;

create policy graph_events_participants on public.graph_edge_events
  for select to authenticated
  using (
    auth.uid() in (actor_id, subject_id)
    and not public.is_blocked_with(case when actor_id = auth.uid() then subject_id else actor_id end));

-- ---------------------------------------------------------------------------
-- Backfill. Existing connections, memberships and messages predate this log, and the demo seed
-- inserts its rows *after* migrations run, so this is a callable, idempotent function rather than
-- a one-shot statement: the migration runs it once, and `pnpm db:seed` runs it again.
-- ---------------------------------------------------------------------------
create or replace function public.graph_backfill()
returns integer language plpgsql security definer set search_path = public as $$
declare
  inserted integer := 0;
  added integer;
begin
  -- Every request ever sent, by the person who sent it.
  insert into public.graph_edge_events (actor_id, subject_id, kind, source, ref_table, ref_id, weight, metadata, created_at)
  select c.requester_id, c.recipient_id, 'request_sent', 'user', 'connections', c.id, 0.15,
         jsonb_build_object('backfilled', true), c.created_at
  from public.connections c
  where not exists (
    select 1 from public.graph_edge_events g
    where g.kind = 'request_sent' and g.ref_id = c.id);
  get diagnostics added = row_count; inserted := inserted + added;

  -- The answer, by the person who gave it.
  insert into public.graph_edge_events (actor_id, subject_id, kind, source, ref_table, ref_id, weight, metadata, created_at)
  select c.recipient_id, c.requester_id, c.status, 'user', 'connections', c.id,
         case when c.status = 'accepted' then 0.5 else 0 end,
         jsonb_build_object('backfilled', true), coalesce(c.responded_at, c.created_at)
  from public.connections c
  where c.status in ('accepted','declined')
    and not exists (
      select 1 from public.graph_edge_events g
      where g.kind = c.status and g.ref_id = c.id);
  get diagnostics added = row_count; inserted := inserted + added;

  -- Joining a group is a story about the person who brought you in: the inviter when there was an
  -- invitation, the group's creator otherwise (seeded and self-joined members).
  insert into public.graph_edge_events (actor_id, subject_id, kind, source, ref_table, ref_id, weight, metadata, created_at)
  select m.user_id, coalesce(i.sender_id, g.creator_id), 'group_joined', 'group', 'groups', g.id, 0.25,
         jsonb_build_object('backfilled', true), coalesce(m.joined_at, m.created_at)
  from public.group_members m
  join public.groups g on g.id = m.group_id
  left join public.invitations i
    on i.kind = 'group' and i.group_id = m.group_id and i.recipient_id = m.user_id and i.status = 'accepted'
  where m.status = 'active'
    and m.user_id <> coalesce(i.sender_id, g.creator_id)
    and not exists (
      select 1 from public.graph_edge_events e
      where e.kind = 'group_joined' and e.ref_id = g.id and e.actor_id = m.user_id);
  get diagnostics added = row_count; inserted := inserted + added;

  -- One row per side of a conversation that has happened: "you two have talked".
  insert into public.graph_edge_events (actor_id, subject_id, kind, source, ref_table, ref_id, weight, metadata, created_at)
  select m.sender_id,
         case when m.sender_id = c.requester_id then c.recipient_id else c.requester_id end,
         'message_exchanged', 'user', 'connections', c.id, 0.2,
         jsonb_build_object('backfilled', true), min(m.created_at)
  from public.direct_messages m
  join public.connections c on c.id = m.connection_id
  where not exists (
    select 1 from public.graph_edge_events g
    where g.kind = 'message_exchanged' and g.ref_id = c.id and g.actor_id = m.sender_id)
  group by m.sender_id, c.id, c.requester_id, c.recipient_id;
  get diagnostics added = row_count; inserted := inserted + added;

  return inserted;
end $$;

comment on function public.graph_backfill() is
  'Idempotent provenance backfill for rows that predate graph_edge_events. Safe to re-run.';

revoke all on function public.graph_backfill() from public, anon, authenticated;

select public.graph_backfill();
