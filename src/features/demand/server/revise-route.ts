import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError, ok, parseBody } from '@/lib/api';
import { MAX_REVISIONS, ReviseProposalRequest } from '../schemas';
import { reviseProposal, type RevisableProposal, type ReviseDeps, type ReviseOutcome } from './revise';

export type ReviseRouteDeps = {
  revise: () => ReviseDeps;
  loadRevisable: (client: SupabaseClient, proposalId: string) => Promise<RevisableProposal | null>;
  /** Shared AI rate limit (README §4); throws RATE_LIMITED. */
  limit: (userId: string) => void;
};

type Ctx = { user: { id: string }; supabase: SupabaseClient };

const UUID = /^[0-9a-f-]{36}$/i;

function toError(outcome: Exclude<ReviseOutcome, { kind: 'revised' }>): ApiError {
  switch (outcome.kind) {
    case 'not_pending':
      return new ApiError('CONFLICT', 'Only pending proposals can be revised', 409);
    case 'limit_reached':
      return new ApiError('CONFLICT', `A proposal can be revised at most ${MAX_REVISIONS} times`, 409);
    case 'no_venue':
      return new ApiError('NOT_FOUND', 'Business not found', 404);
    case 'over_capacity':
      return new ApiError('VALIDATION', `Capacity can be at most ${outcome.capacity}`, 400, { field: 'capacity' });
    case 'llm_failure':
      return new ApiError('AI_UNAVAILABLE', 'The AI could not revise this proposal right now', 503);
    case 'rejected':
      return new ApiError('AI_UNAVAILABLE', 'The AI revision did not pass safety checks', 503, { issues: outcome.issues });
  }
}

/**
 * POST /api/ai/proposals/:id/revise (spec §6 P1). The owning business sends `{ note?, priceCents?,
 * capacity?, slot? }` and gets back a new pending proposal; the old one becomes `expired`.
 */
export async function handleRevise(ctx: Ctx, proposalId: string | undefined, req: Request, deps: ReviseRouteDeps): Promise<Response> {
  if (!proposalId || !UUID.test(proposalId)) throw new ApiError('VALIDATION', 'id must be a uuid', 400);
  const body = await parseBody(ReviseProposalRequest, req);
  const row = await deps.loadRevisable(ctx.supabase, proposalId);
  if (!row) throw new ApiError('NOT_FOUND', 'Proposal not found', 404);
  deps.limit(ctx.user.id);
  const outcome = await reviseProposal(row, body, deps.revise());
  if (outcome.kind !== 'revised') throw toError(outcome);
  return ok(
    { proposalId: outcome.proposalId, supersedes: row.id, revision: row.revision + 1, proposal: outcome.proposal },
    undefined,
    { status: 201 },
  );
}
