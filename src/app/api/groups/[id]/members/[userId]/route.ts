import { ok, withAuth } from '@/lib/api';
import { removeMember } from '@/features/groups/server/members';
import { pathId } from '@/features/matching/server/http';
import { invalidateGraph } from '@/features/graph/server/snapshot';

/** DELETE /api/groups/:id/members/:userId — admins remove a member; never the owner. */
export const DELETE = withAuth(async ({ user, supabase }, _req, params) => {
  const groupId = pathId(params, 'id', 'Group');
  const targetId = pathId(params, 'userId', 'Member');
  const result = await removeMember({ userId: user.id, supabase }, groupId, targetId);
  // A group puts its roster in each member's graph snapshot, which is cached per viewer. Losing
  // membership has to reach that cache — for a private group the roster is what membership gates.
  invalidateGraph(user.id, targetId);
  return ok(result);
});
