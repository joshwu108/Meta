import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { log } from '@/lib/log';
import { notifyInputSchema } from '@/shared/schemas/notification';
import type { NotificationType } from '@/shared/enums';

/**
 * Insert an in-app notification for `userId` (README §4 contract). Runs with the service role
 * because notifications are created on behalf of other users (e.g. a connection request).
 * Validation failures throw; database failures are logged and rethrown so callers can decide
 * whether a missed notification should fail their operation.
 */
export async function notify(
  userId: string,
  type: NotificationType,
  payload: Record<string, unknown> = {},
): Promise<void> {
  const input = notifyInputSchema.parse({ userId, type, payload });
  const admin = createAdminClient();
  const { error } = await admin
    .from('notifications')
    .insert({ user_id: input.userId, type: input.type, payload: input.payload as never });
  if (error) {
    log.error('notify.insert_failed', { userId, type, code: error.code, detail: error.message });
    throw new Error(`notify(${type}) failed: ${error.message}`);
  }
  log.info('notify.sent', { userId, type });
}
