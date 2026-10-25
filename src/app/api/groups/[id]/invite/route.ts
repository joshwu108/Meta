import { ok, parseBody, withAuth } from '@/lib/api';
import { inviteMembers } from '@/features/groups/server/members';
import { pathId } from '@/features/matching/server/http';
import { groupInviteSchema } from '@/shared/schemas/social';

/** POST /api/groups/:id/invite — `{ userIds }`; skips blocked pairs and current members. */
export const POST = withAuth(async ({ user, supabase }, req, params) => {
  const id = pathId(params, 'id', 'Group');
  const { userIds } = await parseBody(groupInviteSchema, req);
  return ok(await inviteMembers({ userId: user.id, supabase }, id, userIds));
});
