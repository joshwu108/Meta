import 'server-only';
import { normalizeTags, type Actor } from '@/features/matching';
import { ApiError } from '@/lib/api/errors';
import { log } from '@/lib/log';
import { createAdminClient } from '@/lib/supabase/admin';
import type { GroupCreate, GroupUpdate } from '@/shared/schemas/social';
import { canEdit, canTransfer } from './authz';
import { loadGroupContext, mapGroupRpcError } from './context';
import { getGroupDetail } from './detail';
import type { GroupDetail } from './types';

/** POST /api/groups: the creator becomes the active owner (one transaction). */
export async function createGroup(actor: Actor, input: GroupCreate): Promise<GroupDetail> {
  const { data: groupId, error } = await createAdminClient().rpc('create_group_with_owner', {
    p_creator: actor.userId,
    p_name: input.name,
    p_visibility: input.visibility,
    ...(input.description ? { p_description: input.description } : {}),
    p_interests: normalizeTags(input.interests),
  });
  if (error || !groupId) throw new ApiError('INTERNAL', 'Could not create the group', 500);
  log.info('groups.created', { userId: actor.userId, visibility: input.visibility });
  return getGroupDetail(actor, groupId);
}

async function transferOwnership(actor: Actor, groupId: string, to: string): Promise<void> {
  const { membership } = await loadGroupContext(actor, groupId);
  if (!canTransfer(membership)) throw new ApiError('FORBIDDEN', 'Only the owner can transfer ownership', 403);
  const { error } = await createAdminClient().rpc('transfer_group_owner', { p_group: groupId, p_from: actor.userId, p_to: to });
  if (error) throw mapGroupRpcError(error.message, 'Could not transfer ownership');
}

/**
 * PATCH /api/groups/:id: admins edit name, description, interests and visibility; the owner may
 * instead send `{ transferOwnerTo }` (required before the owner can leave).
 */
export async function updateGroup(actor: Actor, groupId: string, patch: GroupUpdate): Promise<GroupDetail> {
  if (patch.transferOwnerTo) {
    await transferOwnership(actor, groupId, patch.transferOwnerTo);
    return getGroupDetail(actor, groupId);
  }
  const { group, membership } = await loadGroupContext(actor, groupId);
  if (!canEdit(membership)) throw new ApiError('FORBIDDEN', 'Only group admins can edit the group', 403);
  const kind = patch.visibility && group.kind !== 'event' ? (patch.visibility === 'public' ? 'interest' : 'private') : undefined;
  const update = {
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.description !== undefined ? { description: patch.description || null } : {}),
    ...(patch.interests !== undefined ? { interests: normalizeTags(patch.interests) } : {}),
    ...(patch.visibility !== undefined ? { visibility: patch.visibility } : {}),
    ...(kind ? { kind } : {}),
  };
  const { error } = await createAdminClient().from('groups').update(update).eq('id', groupId);
  if (error) throw new ApiError('INTERNAL', 'Could not update the group', 500);
  return getGroupDetail(actor, groupId);
}
