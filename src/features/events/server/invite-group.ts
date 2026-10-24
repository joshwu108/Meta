import "server-only";
import { selectEventInvitees } from "./invite";
import { activeRsvpUserIds, getVisibleEvent } from "./repo";
import {
  ApiError,
  createAdminClient,
  createEventInvitations,
  getBlockEdges,
  getGroupMemberIds,
  getPendingEventInviteeIds,
  notify,
} from "./stubs";

export type InviteGroupResult = { invited: number; skipped: { rsvped: number; blocked: number; alreadyInvited: number } };

/** POST /events/:id/invite-group: invitations for other active members; never RSVPs anyone (AC4). */
export async function inviteGroupToEvent(callerId: string, eventId: string, groupId: string): Promise<InviteGroupResult> {
  const admin = createAdminClient();
  const event = await getVisibleEvent(admin, eventId);
  if (!event) throw new ApiError("NOT_FOUND", "Event not found");
  if (event.status !== "published" && event.status !== "full") {
    throw new ApiError("CONFLICT", "This event is no longer open for invitations");
  }

  const memberIds = await getGroupMemberIds(groupId);
  const [rsvpedUserIds, blocks, alreadyInvitedIds] = await Promise.all([
    activeRsvpUserIds(admin, eventId, memberIds),
    getBlockEdges(callerId),
    getPendingEventInviteeIds(eventId, memberIds),
  ]);
  const selection = selectEventInvitees({
    callerId,
    members: memberIds.map((userId) => ({ userId, status: "active" as const })),
    rsvpedUserIds,
    blocks,
    alreadyInvitedIds,
  });
  if (!selection.ok) throw new ApiError("FORBIDDEN", "Only active group members can invite the group");

  await createEventInvitations({ senderId: callerId, groupId, eventId, recipientIds: selection.inviteeIds });
  await Promise.all(
    selection.inviteeIds.map((id) =>
      notify(id, "group_invite", { kind: "event", eventId, groupId, title: event.title }),
    ),
  );
  return { invited: selection.inviteeIds.length, skipped: selection.skipped };
}
