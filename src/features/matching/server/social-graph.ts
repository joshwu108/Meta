import 'server-only';
import { ApiError } from '@/lib/api/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { uuidSchema } from '@/shared/schemas/common';

/**
 * Cross-user reads of the social graph. They use the service role because RLS hides other
 * people's blocks; every function returns only ids that involve the given user.
 */

export type BlockEdge = { blockerId: string; blockedId: string };

const id = (value: string) => uuidSchema.parse(value);

function failed(what: string, message: string): never {
  throw new ApiError('INTERNAL', `Could not load ${what}`, 500, { cause: message });
}

/** Every block edge that involves the user, in either direction. */
export async function getBlockEdges(userId: string): Promise<BlockEdge[]> {
  const { data, error } = await createAdminClient()
    .from('blocks')
    .select('blocker_id, blocked_id')
    .or(`blocker_id.eq.${id(userId)},blocked_id.eq.${id(userId)}`);
  if (error) failed('blocks', error.message);
  return (data ?? []).map((row) => ({ blockerId: row.blocker_id, blockedId: row.blocked_id }));
}

/** Ids of everyone the user blocked or was blocked by. */
export async function getBlockedIds(userId: string): Promise<Set<string>> {
  const edges = await getBlockEdges(userId);
  return new Set(edges.map((edge) => (edge.blockerId === userId ? edge.blockedId : edge.blockerId)));
}

/** True when either user has blocked the other. */
export function isBlockedEitherWay(edges: readonly BlockEdge[], a: string, b: string): boolean {
  return edges.some(
    (edge) => (edge.blockerId === a && edge.blockedId === b) || (edge.blockerId === b && edge.blockedId === a),
  );
}

type EdgeRow = { requester_id: string; recipient_id: string; status: string };

async function connectionRows(userId: string, statuses?: readonly string[]): Promise<EdgeRow[]> {
  let query = createAdminClient()
    .from('connections')
    .select('requester_id, recipient_id, status')
    .or(`requester_id.eq.${id(userId)},recipient_id.eq.${id(userId)}`);
  if (statuses) query = query.in('status', [...statuses]);
  const { data, error } = await query;
  if (error) failed('connections', error.message);
  return (data ?? []) as EdgeRow[];
}

const otherParty = (row: EdgeRow, userId: string) => (row.requester_id === userId ? row.recipient_id : row.requester_id);

/** Accepted connections of a user, either direction. */
export async function getConnectionIds(userId: string): Promise<Set<string>> {
  const rows = await connectionRows(userId, ['accepted']);
  return new Set(rows.map((row) => otherParty(row, userId)));
}

/** Everyone the user has any connection row with (pending, accepted or declined). */
export async function getEdgeUserIds(userId: string): Promise<Set<string>> {
  const rows = await connectionRows(userId);
  return new Set(rows.map((row) => otherParty(row, userId)));
}

/** True when the two users are both active members of at least one group. */
export async function sharesActiveGroup(a: string, b: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from('group_members')
    .select('group_id, user_id')
    .in('user_id', [id(a), id(b)])
    .eq('status', 'active');
  if (error) failed('group memberships', error.message);
  const groupsOf = (userId: string) => new Set((data ?? []).filter((row) => row.user_id === userId).map((row) => row.group_id));
  const theirs = groupsOf(b);
  return [...groupsOf(a)].some((groupId) => theirs.has(groupId));
}

/**
 * Whether `requesterId` may address `recipientId` directly (connection request or group invite):
 * the recipient is discoverable, or the two already share an active group.
 */
export async function canReach(requesterId: string, recipientId: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from('profiles')
    .select('is_discoverable')
    .eq('id', id(recipientId))
    .maybeSingle();
  if (error) failed('profile', error.message);
  if (!data) return false;
  return data.is_discoverable || sharesActiveGroup(requesterId, recipientId);
}
