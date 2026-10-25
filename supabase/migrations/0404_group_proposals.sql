-- Workstream 04 · P1 group-originated proposals (spec §3, §6). 03's "Request venue" sends
-- { source: 'group', groupId, planId, suggestionIndex }; one pending proposal per suggestion.

alter table public.event_proposals
  add column source_plan_id uuid,
  add column source_suggestion_index int check (source_suggestion_index >= 0),
  add constraint event_proposals_group_source check (
    source <> 'group' or (source_group_id is not null and source_plan_id is not null and source_suggestion_index is not null)
  );

create unique index event_proposals_one_pending_per_suggestion
  on public.event_proposals (source_group_id, source_plan_id, source_suggestion_index)
  where source = 'group' and status = 'pending';

-- Same contract as 0403, now carrying the group source columns. The parent is expired before
-- the new version is inserted so the one-pending-per-suggestion index never sees two rows.
create or replace function public.save_proposal_revision(p_parent_id uuid, p_proposal jsonb, p_request jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  parent public.event_proposals%rowtype;
  new_id uuid;
begin
  select * into parent from public.event_proposals where id = p_parent_id for update;
  if not found then
    raise exception 'proposal % not found', p_parent_id using errcode = 'P0002';
  end if;
  if parent.status <> 'pending' then
    raise exception 'proposal % is %, not pending', p_parent_id, parent.status using errcode = '55000';
  end if;

  update public.event_proposals
     set status = 'expired', decided_at = now(), decision_note = 'superseded by revision'
   where id = parent.id;

  insert into public.event_proposals (
    run_id, cluster_id, source, source_group_id, source_plan_id, source_suggestion_index, business_id, proposal,
    expires_at, supersedes_id, revision, revision_request
  ) values (
    parent.run_id, parent.cluster_id, parent.source, parent.source_group_id, parent.source_plan_id,
    parent.source_suggestion_index, parent.business_id, p_proposal,
    parent.expires_at, parent.id, parent.revision + 1, p_request
  ) returning id into new_id;
  return new_id;
end $$;
revoke all on function public.save_proposal_revision(uuid, jsonb, jsonb) from public, anon, authenticated;
