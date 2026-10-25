import 'server-only';
import type { Actor } from '@/features/matching';
import { ApiError } from '@/lib/api/errors';
import type { MemberRole, MembershipStatus } from '@/shared/enums';
import type { GroupMemberRow, GroupRow } from '@/shared/schemas/social';
import type { GroupFacts, Membership } from './authz';

export type GroupContext = { group: GroupRow; membership: Membership | null; facts: GroupFacts };

export function factsOf(group: GroupRow): GroupFacts {
  return { visibility: group.visibility, kind: group.kind, creatorId: group.creator_id, archived: group.archived_at !== null };
}

export function toMembership(row: { role: string; status: string } | null | undefined): Membership | null {
  return row ? { role: row.role as MemberRole, status: row.status as MembershipStatus } : null;
}

/**
 * The group as the actor may see it (RLS: public, or private with an invited/active membership)
 * plus the actor's own membership. A group the actor cannot see is NOT_FOUND, never FORBIDDEN.
 */
export async function loadGroupContext(actor: Actor, groupId: string): Promise<GroupContext> {
  const [groupRes, memberRes] = await Promise.all([
    actor.supabase.from('groups').select('*').eq('id', groupId).maybeSingle(),
    actor.supabase.from('group_members').select('role, status').eq('group_id', groupId).eq('user_id', actor.userId).maybeSingle(),
  ]);
  if (groupRes.error || memberRes.error) throw new ApiError('INTERNAL', 'Could not load group', 500);
  if (!groupRes.data) throw new ApiError('NOT_FOUND', 'Group not found', 404);
  const group = groupRes.data as GroupRow;
  return { group, membership: toMembership(memberRes.data), facts: factsOf(group) };
}

/** Membership rows of the given groups readable by the actor, filtered by status. */
export async function loadMemberRows(actor: Actor, groupIds: readonly string[], statuses: readonly MembershipStatus[]): Promise<GroupMemberRow[]> {
  if (groupIds.length === 0) return [];
  const { data, error } = await actor.supabase
    .from('group_members')
    .select('*')
    .in('group_id', [...groupIds])
    .in('status', [...statuses])
    .order('joined_at', { ascending: true, nullsFirst: false });
  if (error) throw new ApiError('INTERNAL', 'Could not load group members', 500);
  return (data ?? []) as GroupMemberRow[];
}

/** Map a Postgres exception raised by a 0301 function to an API error. */
export function mapGroupRpcError(message: string, fallback: string): ApiError {
  const known: Array<[string, ApiError]> = [
    ['OWNER_MUST_TRANSFER', new ApiError('CONFLICT', 'Transfer ownership to another member before leaving', 409)],
    ['NOT_ACTIVE_MEMBER', new ApiError('FORBIDDEN', 'You are not an active member of this group', 403)],
    ['GROUP_NOT_FOUND', new ApiError('NOT_FOUND', 'Group not found', 404)],
    ['MEMBER_NOT_REMOVABLE', new ApiError('NOT_FOUND', 'That person is not in this group', 404)],
    ['NOT_OWNER', new ApiError('FORBIDDEN', 'Only the owner can transfer ownership', 403)],
    ['TRANSFER_TARGET_INVALID', new ApiError('VALIDATION', 'Choose another active member as the new owner', 400)],
    ['INVITATION_STALE', new ApiError('CONFLICT', 'This invitation is no longer valid', 409)],
    ['INVITATION_NOT_PENDING', new ApiError('CONFLICT', 'This invitation was already answered', 409)],
  ];
  return known.find(([token]) => message.includes(token))?.[1] ?? new ApiError('INTERNAL', fallback, 500);
}
