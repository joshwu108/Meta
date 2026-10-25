import { ok, parseBody, parseQuery, withAuth } from '@/lib/api';
import { listConnections, sendConnectionRequest } from '@/features/matching/server/connections';
import { connectionCreateSchema, connectionListQuerySchema } from '@/shared/schemas/social';

/** GET /api/connections?status= — both directions, with public cards. */
export const GET = withAuth(async ({ user, supabase }, req) => {
  const { status } = parseQuery(connectionListQuerySchema, req.url);
  const items = await listConnections({ userId: user.id, supabase }, status);
  return ok(items, { total: items.length });
});

/** POST /api/connections — `{ recipientId, message? }` → 201; CONFLICT if an edge exists. */
export const POST = withAuth(async ({ user, supabase }, req) => {
  const body = await parseBody(connectionCreateSchema, req);
  const item = await sendConnectionRequest({ userId: user.id, supabase }, body);
  return ok(item, undefined, { status: 201 });
});
