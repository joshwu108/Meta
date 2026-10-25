import { ok, withAuth } from '@/lib/api';
import { leaveGroup } from '@/features/groups/server/members';
import { pathId } from '@/features/matching/server/http';
import { invalidateGraph } from '@/features/graph/server/snapshot';

/** POST /api/groups/:id/leave — the owner must transfer first unless they are the last member. */
export const POST = withAuth(async ({ user, supabase }, _req, params) => {
  const id = pathId(params, 'id', 'Group');
  const result = await leaveGroup({ userId: user.id, supabase }, id);
  // A group puts its roster in each member's graph snapshot, which is cached per viewer. Losing
  // membership has to reach that cache — for a private group the roster is what membership gates.
  invalidateGraph(user.id);
  return ok(result);
});
