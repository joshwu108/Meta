import { ApiError, ok, withAuth } from '@/lib/api';
import { markNotificationRead } from '@/features/core/server/notifications';
import { uuidSchema } from '@/shared/schemas/common';

/** PATCH /api/notifications/:id/read — mark one notification read. */
export const PATCH = withAuth(async ({ supabase }, _req, params) => {
  const id = uuidSchema.safeParse(params.id);
  if (!id.success) throw new ApiError('VALIDATION', 'Invalid notification id', 400);
  return ok(await markNotificationRead(supabase, id.data));
});
