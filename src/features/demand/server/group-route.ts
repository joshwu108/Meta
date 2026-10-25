import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError, ok } from '@/lib/api';
import type { GroupProposalRequest } from '../schemas';
import { proposeForGroup, type GroupDeps, type GroupOutcome, type GroupVenueRequest } from './group';

export type GroupRouteDeps = {
  isActiveMember: (client: SupabaseClient, userId: string, groupId: string) => Promise<boolean>;
  getRequest: (groupId: string, planId: string, suggestionIndex: number) => Promise<GroupVenueRequest | null>;
  propose: () => GroupDeps;
  /** Shared AI rate limit (README §4); throws RATE_LIMITED. */
  limit: (userId: string) => void;
};

type Ctx = { user: { id: string }; supabase: SupabaseClient };

function toError(outcome: Exclude<GroupOutcome, { kind: 'created' }>): ApiError {
  switch (outcome.kind) {
    case 'too_small':
      return new ApiError('VALIDATION', `Groups need at least ${outcome.minimum} active members to request a venue`, 400);
    case 'no_location':
      return new ApiError('VALIDATION', 'No member has shared a neighborhood, so no venue can be matched', 400);
    case 'duplicate':
      return new ApiError('CONFLICT', 'This idea has already been sent to a venue', 409);
    case 'unmatched':
      return new ApiError('NOT_FOUND', 'No nearby venue can host this idea yet', 404);
    case 'llm_failure':
      return new ApiError('AI_UNAVAILABLE', 'The AI could not draft a proposal right now', 503);
    case 'rejected':
      return new ApiError('AI_UNAVAILABLE', 'The AI draft did not pass safety checks', 503, { issues: outcome.issues });
  }
}

/**
 * POST /api/ai/generate-opportunities with `{ source: 'group', ... }` (spec §6 P1). Any active member
 * may send a suggestion that 03 marks eligible (a venue idea with votes from half the group).
 */
export async function handleGroupRequest(ctx: Ctx, body: GroupProposalRequest, deps: GroupRouteDeps | undefined): Promise<Response> {
  if (!deps) throw new ApiError('INTERNAL', 'Group proposals are not wired', 500);
  if (!(await deps.isActiveMember(ctx.supabase, ctx.user.id, body.groupId))) {
    throw new ApiError('FORBIDDEN', 'Only active group members can request a venue', 403);
  }
  const request = await deps.getRequest(body.groupId, body.planId, body.suggestionIndex);
  if (!request) {
    throw new ApiError('VALIDATION', 'This idea needs a venue and votes from at least half the group', 400);
  }
  deps.limit(ctx.user.id);
  const outcome = await proposeForGroup(request, deps.propose());
  if (outcome.kind !== 'created') throw toError(outcome);
  return ok({ proposalId: outcome.proposalId, businessName: outcome.venue.card.name }, undefined, { status: 201 });
}
