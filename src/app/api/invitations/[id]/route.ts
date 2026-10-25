import { ok, parseBody, withAuth } from '@/lib/api';
import { respondToInvitation } from '@/features/groups/server/invitations';
import { pathId } from '@/features/matching/server/http';
import { invitationRespondSchema } from '@/shared/schemas/social';

/** PATCH /api/invitations/:id — `{ status }`; accepting a group invitation activates the membership. */
export const PATCH = withAuth(async ({ user, supabase }, req, params) => {
  const id = pathId(params, 'id', 'Invitation');
  const { status } = await parseBody(invitationRespondSchema, req);
  return ok(await respondToInvitation({ userId: user.id, supabase }, id, status));
});
