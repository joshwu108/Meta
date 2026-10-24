import { ok, withAuth } from '@/lib/api';
import { pathId } from '@/features/matching/server/http';
import { blockUser } from '@/features/matching/server/safety';

/** POST /api/users/:id/block — block, end any connection, expire invitations between the pair. */
export const POST = withAuth(async ({ user, supabase }, _req, params) => {
  const id = pathId(params, 'id', 'User');
  return ok(await blockUser({ userId: user.id, supabase }, id));
});
