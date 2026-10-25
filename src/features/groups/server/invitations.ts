import 'server-only';
import { chunk, ID_FILTER_BATCH, type Actor } from '@/features/matching';
import { ApiError } from '@/lib/api/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { uuidSchema } from '@/shared/schemas/common';
import type { InvitationRow } from '@/shared/schemas/social';
import { mapGroupRpcError } from './context';

export type InvitationResult = {
  id: string;
  kind: 'group' | 'event';
  status: InvitationRow['status'];
  groupId: string | null;
  eventId: string | null;
};

const toResult = (row: InvitationRow): InvitationResult => ({ id: row.id, kind: row.kind, status: row.status, groupId: row.group_id, eventId: row.event_id });

/**
 * PATCH /api/invitations/:id: the recipient accepts or declines a pending invitation. For a group
 * invitation the database activates (accept) or closes (decline) the membership in the same
 * statement. Event invitations never create RSVPs; the invitee RSVPs separately (06 AC4).
 */
export async function respondToInvitation(actor: Actor, invitationId: string, status: 'accepted' | 'declined'): Promise<InvitationResult> {
  const { data: row, error } = await actor.supabase.from('invitations').select('*').eq('id', invitationId).maybeSingle();
  if (error) throw new ApiError('INTERNAL', 'Could not load the invitation', 500);
  if (!row) throw new ApiError('NOT_FOUND', 'Invitation not found', 404);
  if (row.recipient_id !== actor.userId) throw new ApiError('FORBIDDEN', 'Only the invited person can answer this invitation', 403);
  if (row.status !== 'pending') throw new ApiError('CONFLICT', 'This invitation was already answered', 409);

  const { data: updated, error: updateError } = await actor.supabase
    .from('invitations')
    .update({ status })
    .eq('id', invitationId)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();
  if (updateError) throw mapGroupRpcError(updateError.message, 'Could not answer the invitation');
  if (!updated) throw new ApiError('CONFLICT', 'This invitation was already answered', 409);
  return toResult(updated as InvitationRow);
}

// ---------------------------------------------------------------------------
// Event invitations, for workstream 06's invite-group flow (invitations kind = 'event')
// ---------------------------------------------------------------------------

export type PendingEventInvitation = { id: string; eventId: string; groupId: string | null; senderId: string; createdAt: string };

/** Create `invitations(kind='event')` rows; never touches RSVPs. Returns the new ids. */
export async function createEventInvitations(input: {
  senderId: string;
  groupId: string;
  eventId: string;
  recipientIds: readonly string[];
}): Promise<string[]> {
  if (input.recipientIds.length === 0) return [];
  const rows = input.recipientIds.map((recipientId) => ({
    kind: 'event',
    group_id: input.groupId,
    event_id: input.eventId,
    sender_id: input.senderId,
    recipient_id: recipientId,
  }));
  const { data, error } = await createAdminClient().from('invitations').insert(rows).select('id');
  if (error) throw new ApiError('INTERNAL', 'Could not create event invitations', 500);
  return (data ?? []).map((row) => row.id);
}

/** Recipients who already hold a pending invitation to the event. */
export async function getPendingEventInviteeIds(eventId: string, recipientIds: readonly string[]): Promise<Set<string>> {
  if (recipientIds.length === 0) return new Set();
  const event = uuidSchema.parse(eventId);
  const admin = createAdminClient();
  const reads = await Promise.all(
    chunk([...new Set(recipientIds)], ID_FILTER_BATCH).map((batch) =>
      admin.from('invitations').select('recipient_id').eq('kind', 'event').eq('event_id', event).eq('status', 'pending').in('recipient_id', batch),
    ),
  );
  if (reads.some((read) => read.error)) throw new ApiError('INTERNAL', 'Could not load event invitations', 500);
  return new Set(reads.flatMap((read) => read.data ?? []).map((row) => row.recipient_id));
}

/** A user's pending event invitations, newest first (06's Activity hub). */
export async function getPendingEventInvitations(userId: string): Promise<PendingEventInvitation[]> {
  const { data, error } = await createAdminClient()
    .from('invitations')
    .select('id, event_id, group_id, sender_id, created_at')
    .eq('recipient_id', uuidSchema.parse(userId))
    .eq('kind', 'event')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw new ApiError('INTERNAL', 'Could not load event invitations', 500);
  return (data ?? []).flatMap((row) =>
    row.event_id ? [{ id: row.id, eventId: row.event_id, groupId: row.group_id, senderId: row.sender_id, createdAt: row.created_at }] : [],
  );
}
