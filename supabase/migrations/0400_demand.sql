-- Workstream 04: community demand clusters and AI event proposals (specs/04 §4).
-- Depends on 0100_core.sql (profiles, set_updated_at()). 05's businesses table is created
-- later (0500); 0500 adds the event_proposals.business_id FK, and the business-read
-- policies below resolve ownership at query time so they work in either order.

create table public.opportunity_runs (
  id uuid primary key default gen_random_uuid(),
  triggered_by text not null check (triggered_by in ('manual','cron','group')),
  status text not null default 'running' check (status in ('running','completed','failed')),
  stats jsonb not null default '{}'::jsonb,   -- RunStats plus "stage" for the operator tracker
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
-- At most one running run: the pipeline lock (see start_opportunity_run).
create unique index opportunity_runs_one_running on public.opportunity_runs ((true)) where status = 'running';

create table public.demand_clusters (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.opportunity_runs(id) on delete cascade,
  signature text not null,                    -- '<category>|<slot>|<geocell>'
  category text not null,
  slot text not null,
  geocell text not null,
  center_lat numeric(6,2) not null,
  center_lng numeric(6,2) not null,
  member_count int not null check (member_count >= 1),
  top_interests jsonb not null,
  group_size_mode text,
  budget_p50_cents int,
  activity_prefs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index demand_clusters_signature_idx on public.demand_clusters (signature, created_at desc);

-- SERVICE ROLE ONLY. Never exposed through any policy or view.
create table public.demand_cluster_members (
  cluster_id uuid not null references public.demand_clusters(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (cluster_id, user_id)
);

create table public.event_proposals (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.opportunity_runs(id) on delete set null,
  cluster_id uuid references public.demand_clusters(id) on delete set null,
  source text not null default 'demand' check (source in ('demand','group')),
  source_group_id uuid,
  business_id uuid not null,                   -- FK added by 0500_business.sql
  status text not null default 'pending' check (status in ('pending','approved','modified','rejected','expired')),
  proposal jsonb not null,                     -- StoredProposal, immutable after insert
  business_edits jsonb,
  decided_at timestamptz,
  decision_note text,
  resulting_event_id uuid,
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index event_proposals_business_idx on public.event_proposals (business_id, status, created_at desc);

create trigger event_proposals_updated before update on public.event_proposals
  for each row execute function public.set_updated_at();

-- The proposal document is immutable; 05 writes edits to business_edits.
create or replace function public.event_proposals_freeze_document() returns trigger
language plpgsql as $$
begin
  if new.proposal is distinct from old.proposal then
    raise exception 'event_proposals.proposal is immutable; write changes to business_edits';
  end if;
  return new;
end $$;
create trigger event_proposals_freeze before update on public.event_proposals
  for each row execute function public.event_proposals_freeze_document();

-- ---------------------------------------------------------------- RLS
alter table public.opportunity_runs enable row level security;        -- no policies: service role only
alter table public.demand_clusters enable row level security;
alter table public.demand_cluster_members enable row level security;  -- no policies
alter table public.event_proposals enable row level security;
revoke all on public.demand_cluster_members from anon, authenticated;
revoke all on public.opportunity_runs from anon, authenticated;

-- Ownership check resolved at call time so this migration does not depend on 0500.
create or replace function public.demand_owns_business(target uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return exists (select 1 from public.businesses b where b.id = target and b.owner_id = auth.uid());
exception when undefined_table then
  return false;
end $$;
revoke all on function public.demand_owns_business(uuid) from public, anon;
grant execute on function public.demand_owns_business(uuid) to authenticated;

create policy proposals_business_read on public.event_proposals
  for select to authenticated using (public.demand_owns_business(business_id));

-- AC2: a business may see which cluster its proposal came from, but never the raw count,
-- the interest tag counts, or the location columns. Column grants enforce that under RLS.
revoke select on public.demand_clusters from anon, authenticated;
grant select (id, run_id, category, slot, group_size_mode, budget_p50_cents, activity_prefs, created_at)
  on public.demand_clusters to authenticated;

create policy clusters_business_read on public.demand_clusters
  for select to authenticated using (
    exists (select 1 from public.event_proposals p where p.cluster_id = demand_clusters.id and public.demand_owns_business(p.business_id))
  );

-- ---------------------------------------------------------------- pipeline lock
-- Session advisory locks do not survive PostgREST's connection pooling, so the lock is the
-- one-running-run unique index. A run left 'running' for 10 minutes is treated as crashed.
create or replace function public.start_opportunity_run(trigger_source text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  run_id uuid;
begin
  update public.opportunity_runs
     set status = 'failed', error = 'abandoned', finished_at = now()
   where status = 'running' and started_at < now() - interval '10 minutes';
  insert into public.opportunity_runs (triggered_by, stats) values (trigger_source, '{"stage":"collecting"}'::jsonb)
  returning id into run_id;
  return run_id;
exception when unique_violation then
  return null;
end $$;
revoke all on function public.start_opportunity_run(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- atomic store (service role)
-- Inserts the cluster, its members and the proposal in one transaction.
create or replace function public.save_demand_proposal(
  p_run_id uuid, p_cluster jsonb, p_member_ids uuid[], p_business_id uuid, p_proposal jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_cluster_id uuid;
  new_proposal_id uuid;
begin
  insert into public.demand_clusters (
    run_id, signature, category, slot, geocell, center_lat, center_lng, member_count,
    top_interests, group_size_mode, budget_p50_cents, activity_prefs
  ) values (
    p_run_id, p_cluster->>'signature', p_cluster->>'category', p_cluster->>'slot', p_cluster->>'geocell',
    (p_cluster->>'center_lat')::numeric, (p_cluster->>'center_lng')::numeric, cardinality(p_member_ids),
    coalesce(p_cluster->'top_interests', '[]'::jsonb), p_cluster->>'group_size_mode',
    (p_cluster->>'budget_p50_cents')::int, coalesce(p_cluster->'activity_prefs', '[]'::jsonb)
  ) returning id into new_cluster_id;

  insert into public.demand_cluster_members (cluster_id, user_id)
  select new_cluster_id, unnest(p_member_ids);

  insert into public.event_proposals (run_id, cluster_id, business_id, proposal)
  values (p_run_id, new_cluster_id, p_business_id, p_proposal)
  returning id into new_proposal_id;
  return new_proposal_id;
end $$;
revoke all on function public.save_demand_proposal(uuid, jsonb, uuid[], uuid, jsonb) from public, anon, authenticated;
