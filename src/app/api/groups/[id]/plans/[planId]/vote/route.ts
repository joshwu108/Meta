import { ok, parseBody, withAuth } from '@/lib/api';
import { toggleVote } from '@/features/groups/server/plans';
import { pathId } from '@/features/matching/server/http';
import { planVoteSchema } from '@/shared/schemas/social';

/** POST /api/groups/:id/plans/:planId/vote — P1 `{ suggestionIndex }` toggles my vote. */
export const POST = withAuth(async ({ user, supabase }, req, params) => {
  const groupId = pathId(params, 'id', 'Group');
  const planId = pathId(params, 'planId', 'Plan');
  const { suggestionIndex } = await parseBody(planVoteSchema, req);
  return ok(await toggleVote({ userId: user.id, supabase }, groupId, planId, suggestionIndex));
});
