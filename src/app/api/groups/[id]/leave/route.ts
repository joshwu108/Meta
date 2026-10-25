import { ok, withAuth } from '@/lib/api';
import { leaveGroup } from '@/features/groups/server/members';
import { pathId } from '@/features/matching/server/http';

/** POST /api/groups/:id/leave — the owner must transfer first unless they are the last member. */
export const POST = withAuth(async ({ user, supabase }, _req, params) => {
  const id = pathId(params, 'id', 'Group');
  return ok(await leaveGroup({ userId: user.id, supabase }, id));
});
