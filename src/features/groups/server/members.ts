import 'server-only';
import { canReach, getBlockEdges, getConnectionIds, getPublicCard, isBlockedEitherWay, notifySafely, type Actor } from '@/features/matching';
import { ApiError } from '@/lib/api/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { canInvite, canRemove } from './authz';
import { loadGroupContext, loadMemberRows, mapGroupRpcError, toMembership } from './context';

export type InviteResult = {
  invited: string[];
  skipped: { alreadyMember: number; blocked: number; unreachable: number };
};

type Classified = { eligible: string[]; alreadyMember: number; blocked: number; unreachable: number };

async function classifyInvitees(actor: Actor, groupId: string, userIds: readonly string[]): Promise<Classified> {
  const candidates = [...new Set(userIds)].filter((id) => id !== actor.userId);
  const [edges, connections, current] = await Promise.all([
    getBlockEdges(actor.userId),
    getConnectionIds(actor.userId),
    loadMemberRows(actor, [groupId], ['active', 'invited']),
  ]);
  const members = new Set(current.map((row) => row.user_id));
  const alreadyMember = candidates.filter((id) => members.has(id));
  const blocked = candidates.filter((id) => !members.has(id) && isBlockedEitherWay(edges, actor.userId, id));
  const open = candidates.filter((id) => !members.has(id) && !blocked.includes(id));
  const reachable = await Promise.all(open.map((id) => connections.has(id) || canReach(actor.userId, id)));
  const eligible = open.filter((_, i) => reachable[i]);
  return { eligible, alreadyMember: alreadyMember.length, blocked: blocked.length, unreachable: open.length - eligible.length };
}

/**
 * POST /api/groups/:id/invite: admins, or any active member of a public group. Blocked pairs,
 * current members and people the inviter cannot reach (not discoverable, not a connection, no
 * shared group) are skipped. Creates invitations + `invited` memberships and notifies each invitee.
 */
export async function inviteMembers(actor: Actor, groupId: string, userIds: readonly string[]): Promise<InviteResult> {
  const { group, membership, facts } = await loadGroupContext(actor, groupId);
  if (!canInvite(facts, membership)) throw new ApiError('FORBIDDEN', 'You cannot invite people to this group', 403);
  const classified = await classifyInvitees(actor, groupId, userIds);
  const skipped = { alreadyMember: classified.alreadyMember, blocked: classified.blocked, unreachable: classified.unreachable };
  if (classified.eligible.length === 0) return { invited: [], skipped };

  const { data, error } = await createAdminClient().rpc('invite_to_group', { p_group: groupId, p_sender: actor.userId, p_recipients: classified.eligible });
  if (error) throw mapGroupRpcError(error.message, 'Could not send the invitations');
  const inviter = await getPublicCard(actor.userId);
  await Promise.all(
    (data ?? []).map((row) =>
      notifySafely(row.invitee_id, 'group_invite', {
        title: `${inviter?.displayName ?? 'Someone'} invited you to ${group.name}`,
        groupId,
        invitationId: row.invitation_id,
      }),
    ),
  );
  return { invited: (data ?? []).map((row) => row.invitee_id), skipped };
}

/** DELETE /api/groups/:id/members/:userId: admins remove members; the owner can never be removed. */
export async function removeMember(actor: Actor, groupId: string, targetId: string): Promise<{ removed: true }> {
  if (targetId === actor.userId) throw new ApiError('VALIDATION', 'Use "Leave group" to leave', 400);
  const { membership } = await loadGroupContext(actor, groupId);
  const { data: target, error } = await actor.supabase.from('group_members').select('role, status').eq('group_id', groupId).eq('user_id', targetId).maybeSingle();
  if (error) throw new ApiError('INTERNAL', 'Could not load the member', 500);
  const decision = canRemove(membership, toMembership(target));
  if (!decision.ok) throw new ApiError(decision.code, decision.message);
  const { error: rpcError } = await createAdminClient().rpc('remove_group_member', { p_group: groupId, p_user: targetId });
  if (rpcError) throw mapGroupRpcError(rpcError.message, 'Could not remove the member');
  return { removed: true };
}

/**
 * POST /api/groups/:id/leave: members leave; the owner must transfer ownership first unless they
 * are the last active member, in which case the group is archived.
 */
export async function leaveGroup(actor: Actor, groupId: string): Promise<{ status: 'left' | 'archived' }> {
  await loadGroupContext(actor, groupId);
  const { data, error } = await createAdminClient().rpc('leave_group', { p_group: groupId, p_user: actor.userId });
  if (error) throw mapGroupRpcError(error.message, 'Could not leave the group');
  return { status: data === 'archived' ? 'archived' : 'left' };
}
