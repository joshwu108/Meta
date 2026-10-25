import { ok, parseBody, withAuth } from '@/lib/api';
import { getGroupDetail } from '@/features/groups/server/detail';
import { updateGroup } from '@/features/groups/server/manage';
import { pathId } from '@/features/matching/server/http';
import { groupUpdateSchema } from '@/shared/schemas/social';

/** GET /api/groups/:id — group, roster, my role, upcoming events, latest plan. */
export const GET = withAuth(async ({ user, supabase }, _req, params) => {
  const id = pathId(params, 'id', 'Group');
  return ok(await getGroupDetail({ userId: user.id, supabase }, id));
});

/** PATCH /api/groups/:id — admins edit details; the owner may send `{ transferOwnerTo }`. */
export const PATCH = withAuth(async ({ user, supabase }, req, params) => {
  const id = pathId(params, 'id', 'Group');
  const patch = await parseBody(groupUpdateSchema, req);
  return ok(await updateGroup({ userId: user.id, supabase }, id, patch));
});
