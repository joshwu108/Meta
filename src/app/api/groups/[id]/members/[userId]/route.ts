import { ok, withAuth } from '@/lib/api';
import { removeMember } from '@/features/groups/server/members';
import { pathId } from '@/features/matching/server/http';

/** DELETE /api/groups/:id/members/:userId — admins remove a member; never the owner. */
export const DELETE = withAuth(async ({ user, supabase }, _req, params) => {
  const groupId = pathId(params, 'id', 'Group');
  const targetId = pathId(params, 'userId', 'Member');
  return ok(await removeMember({ userId: user.id, supabase }, groupId, targetId));
});
