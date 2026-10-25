import { ok, parseBody, withAuth } from '@/lib/api';
import { respondToConnection } from '@/features/matching/server/connections';
import { pathId } from '@/features/matching/server/http';
import { connectionRespondSchema } from '@/shared/schemas/social';

/** PATCH /api/connections/:id — `{ status: 'accepted' | 'declined' }`, recipient only. */
export const PATCH = withAuth(async ({ user, supabase }, req, params) => {
  const id = pathId(params, 'id', 'Connection request');
  const { status } = await parseBody(connectionRespondSchema, req);
  return ok(await respondToConnection({ userId: user.id, supabase }, id, status));
});
