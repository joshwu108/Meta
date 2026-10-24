import 'server-only';
import { createServerClient } from '@/lib/supabase/server';
import { countUnread } from './notifications';

/** Unread notification count for the signed-in user, 0 when signed out or on error. */
export async function countUnreadForCurrentUser(): Promise<number> {
  try {
    const supabase = await createServerClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return 0;
    return await countUnread(supabase);
  } catch {
    return 0;
  }
}
