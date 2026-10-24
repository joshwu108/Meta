import { ok, parseQuery, withAuth } from '@/lib/api';
import { listNotifications } from '@/features/core/server/notifications';
import { notificationListQuerySchema } from '@/shared/schemas/notification';

/** GET /api/notifications?unread=true&limit=30 — newest first plus unread count. */
export const GET = withAuth(async ({ supabase }, req) => {
  const query = parseQuery(notificationListQuerySchema, req.url);
  const result = await listNotifications(supabase, { unreadOnly: query.unread, limit: query.limit });
  return ok(result, { total: result.items.length, limit: query.limit });
});
