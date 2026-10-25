import { ok, withAuth } from '@/lib/api';
import { joinGroup } from '@/features/groups/server/members';
import { pathId } from '@/features/matching/server/http';

/** POST /api/groups/:id/join — anyone signed in joins a public interest group. */
export const POST = withAuth(async ({ user, supabase }, _req, params) => {
  const id = pathId(params, 'id', 'Group');
  return ok(await joinGroup({ userId: user.id, supabase }, id));
});
