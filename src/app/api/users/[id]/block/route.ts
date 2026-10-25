import { ok, withAuth } from '@/lib/api';
import { pathId } from '@/features/matching/server/http';
import { blockUser } from '@/features/matching/server/safety';
import { invalidateGraph } from '@/features/graph/server/snapshot';

/** POST /api/users/:id/block — block, end any connection, expire invitations between the pair. */
export const POST = withAuth(async ({ user, supabase }, _req, params) => {
  const id = pathId(params, 'id', 'User');
  const result = await blockUser({ userId: user.id, supabase }, id);
  // `blockUser` drops both people's cached match lists. Graph snapshots are cached per viewer
  // too, and the graph's read side cannot be imported from `matching` without a cycle, so the
  // route is where the pair's snapshots are dropped — a block has to land on every surface at
  // once, in both directions.
  invalidateGraph(user.id, id);
  return ok(result);
});
