import { aiRateLimiter, ok, parseBody, withAuth } from '@/lib/api';
import { planForGroup } from '@/features/groups/server/planner/plan';
import { pathId } from '@/features/matching/server/http';
import { planRequestSchema } from '@/shared/schemas/social';

/** POST /api/groups/:id/plan — `{ request }` → GroupPlan built from consenting members' data. */
export const POST = withAuth(async ({ user, supabase }, req, params) => {
  const id = pathId(params, 'id', 'Group');
  const { request } = await parseBody(planRequestSchema, req);
  aiRateLimiter.assert(user.id);
  return ok(await planForGroup({ userId: user.id, supabase }, id, request), undefined, { status: 201 });
});
