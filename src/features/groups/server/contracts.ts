import 'server-only';
import { ApiError } from '@/lib/api/errors';
import { log } from '@/lib/log';
import { createAdminClient } from '@/lib/supabase/admin';
import { uuidSchema } from '@/shared/schemas/common';

/** README §4 contract: ids of a group's active members (empty for unknown or archived groups). */
export async function getGroupMemberIds(groupId: string): Promise<string[]> {
  const admin = createAdminClient();
  const id = uuidSchema.parse(groupId);
  const { data: group, error: groupError } = await admin.from('groups').select('archived_at').eq('id', id).maybeSingle();
  // A failed lookup must not read as "no members": callers act on this list (06 invites from it).
  if (groupError) throw new ApiError('INTERNAL', 'Could not load group members', 500);
  if (!group || group.archived_at) return [];
  const { data, error } = await admin.from('group_members').select('user_id').eq('group_id', id).eq('status', 'active');
  if (error) throw new ApiError('INTERNAL', 'Could not load group members', 500);
  return (data ?? []).map((row) => row.user_id);
}

/** Card for public-group listings on other surfaces (06's Discover "Groups to join"). */
export type PublicGroupCard = { id: string; name: string; description: string | null; interests: string[]; memberCount: number };

/** Public, non-archived groups, largest first. Contains no member identities. */
export async function getPublicGroups(limit = 6): Promise<PublicGroupCard[]> {
  const admin = createAdminClient();
  const { data: groups, error } = await admin
    .from('groups')
    .select('id, name, description, interests')
    .eq('visibility', 'public')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new ApiError('INTERNAL', 'Could not load groups', 500);
  const ids = (groups ?? []).map((g) => g.id);
  const { data: members, error: countError } = ids.length
    ? await admin.from('group_members').select('group_id').eq('status', 'active').in('group_id', ids)
    : { data: [] as Array<{ group_id: string }>, error: null };
  // Counts only order a discovery widget, so a failed count degrades (logged) instead of failing the page.
  if (countError) log.warn('groups.public_counts_failed', { message: countError.message });
  const counts = new Map<string, number>();
  for (const row of members ?? []) counts.set(row.group_id, (counts.get(row.group_id) ?? 0) + 1);
  return (groups ?? [])
    .map((g) => ({ id: g.id, name: g.name, description: g.description, interests: g.interests, memberCount: counts.get(g.id) ?? 0 }))
    .sort((a, b) => b.memberCount - a.memberCount || a.name.localeCompare(b.name))
    .slice(0, Math.max(0, limit));
}
