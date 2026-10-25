-- Workstream 04 · P1 revision (spec §6 `POST /api/ai/proposals/:id/revise`).
-- A revision is a new pending proposal that supersedes the old one. `proposal` stays immutable
-- and `business_edits` stays 05's EventEdits; the owner's request is kept on the new row.

alter table public.event_proposals
  add column supersedes_id uuid references public.event_proposals(id) on delete set null,
  add column revision int not null default 0 check (revision between 0 and 3),
  add column revision_request jsonb;
create index event_proposals_supersedes_idx on public.event_proposals (supersedes_id);

-- Service role only. Locks the parent so a revise cannot race 05's decide_proposal.
-- Errors: P0002 not found · 55000 not pending · 23514 revision limit (check constraint).
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

  insert into public.event_proposals (
    run_id, cluster_id, source, source_group_id, business_id, proposal,
    expires_at, supersedes_id, revision, revision_request
  ) values (
    parent.run_id, parent.cluster_id, parent.source, parent.source_group_id, parent.business_id, p_proposal,
    parent.expires_at, parent.id, parent.revision + 1, p_request
  ) returning id into new_id;

  update public.event_proposals
     set status = 'expired', decided_at = now(), decision_note = 'superseded by revision'
   where id = parent.id;
  return new_id;
end $$;
revoke all on function public.save_proposal_revision(uuid, jsonb, jsonb) from public, anon, authenticated;
