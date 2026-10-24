import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@/lib/api/errors';
import type { Database } from '@/lib/supabase/database.types';
import type { NotificationRow } from '@/shared/schemas/notification';

type Client = SupabaseClient<Database>;

/** List the current user's notifications, newest first. RLS limits rows to `auth.uid()`. */
export async function listNotifications(
  supabase: Client,
  opts: { unreadOnly?: boolean; limit?: number } = {},
): Promise<{ items: NotificationRow[]; unreadCount: number }> {
  let query = supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 30);
  if (opts.unreadOnly) query = query.is('read_at', null);
  const [{ data, error }, unread] = await Promise.all([query, countUnread(supabase)]);
  if (error) throw new ApiError('INTERNAL', 'Could not load notifications', 500);
  return { items: (data ?? []) as NotificationRow[], unreadCount: unread };
}

/** Number of unread notifications for the current user. */
export async function countUnread(supabase: Client): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  if (error) throw new ApiError('INTERNAL', 'Could not count notifications', 500);
  return count ?? 0;
}

/** Mark one notification read. Returns the updated row or throws NOT_FOUND. */
export async function markNotificationRead(supabase: Client, id: string): Promise<NotificationRow> {
  const { data, error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) throw new ApiError('INTERNAL', 'Could not update notification', 500);
  if (!data) throw new ApiError('NOT_FOUND', 'Notification not found', 404);
  return data as NotificationRow;
}
