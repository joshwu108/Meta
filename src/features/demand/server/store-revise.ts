import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@/lib/api';
import type { StoredProposal } from '../schemas';
import type { RevisableProposal, ReviseDeps } from './revise';

type Row = {
  id: string;
  status: string;
  business_id: string;
  revision: number;
  proposal: StoredProposal;
  demand_clusters: { budget_p50_cents: number | null } | null;
};

/**
 * Reads with the caller's own client: `proposals_business_read` returns the row only to the
 * owning business, so "not yours" and "does not exist" are the same 404.
 */
export async function loadRevisable(client: SupabaseClient, proposalId: string): Promise<RevisableProposal | null> {
  const { data, error } = await client
    .from('event_proposals')
    .select('id, status, business_id, revision, proposal, demand_clusters(budget_p50_cents)')
    .eq('id', proposalId)
    .maybeSingle();
  if (error) throw new Error(`proposal lookup failed: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as Row;
  return {
    id: row.id,
    status: row.status,
    businessId: row.business_id,
    revision: row.revision,
    proposal: row.proposal,
    budgetP50Cents: row.demand_clusters?.budget_p50_cents ?? null,
  };
}

/** SQLSTATEs raised by `save_proposal_revision` (0403) when a concurrent decision wins the race. */
const CONFLICT_CODES: ReadonlySet<string> = new Set(['55000', '23514']);

export function revisionSaver(admin: SupabaseClient): ReviseDeps['saveRevision'] {
  return async ({ parentId, proposal, request }) => {
    const { data, error } = await admin.rpc('save_proposal_revision', { p_parent_id: parentId, p_proposal: proposal, p_request: request });
    if (!error) return data as string;
    if (error.code === 'P0002') throw new ApiError('NOT_FOUND', 'Proposal not found', 404);
    if (CONFLICT_CODES.has(error.code)) throw new ApiError('CONFLICT', 'This proposal can no longer be revised', 409);
    throw new Error(`save revision failed: ${error.message}`);
  };
}
