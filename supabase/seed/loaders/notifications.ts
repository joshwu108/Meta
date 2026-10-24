import { loadFixture, requireUser, type SeedContext } from '../context';
import { seedNotificationSchema } from '../types';

/** Unread notifications so the bell shows a count for the demo accounts. */
export async function loadNotifications(ctx: SeedContext): Promise<number> {
  const items = await loadFixture('notifications', seedNotificationSchema);
  const rows = items.map((item) => ({ user_id: requireUser(ctx, item.user), type: item.type, payload: item.payload }));
  const { error } = await ctx.admin.from('notifications').insert(rows);
  if (error) throw new Error(`notifications insert failed: ${error.message}`);
  return rows.length;
}
