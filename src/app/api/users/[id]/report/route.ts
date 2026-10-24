import { ok, parseBody, withAuth } from '@/lib/api';
import { pathId } from '@/features/matching/server/http';
import { reportUser } from '@/features/matching/server/safety';
import { reportCreateSchema } from '@/shared/schemas/social';

/** POST /api/users/:id/report — `{ reason, details? }`. */
export const POST = withAuth(async ({ user, supabase }, req, params) => {
  const id = pathId(params, 'id', 'User');
  const body = await parseBody(reportCreateSchema, req);
  return ok(await reportUser({ userId: user.id, supabase }, id, body), undefined, { status: 201 });
});
