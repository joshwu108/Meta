import "server-only";
import type { MembershipStatus } from "@/shared/enums";
import { isBlockedEitherWay, type BlockEdge } from "./visibility";

export type GroupMember = { userId: string; status: MembershipStatus };

export type InviteSelectionInput = {
  callerId: string;
  members: readonly GroupMember[];
  /** Members with a confirmed or waitlisted RSVP for the event. */
  rsvpedUserIds: ReadonlySet<string>;
  /** Block edges involving the caller. */
  blocks: readonly BlockEdge[];
  /** Members who already hold a pending invitation to this event. */
  alreadyInvitedIds: ReadonlySet<string>;
};

export type InviteSelection =
  | { ok: true; inviteeIds: string[]; skipped: { rsvped: number; blocked: number; alreadyInvited: number } }
  | { ok: false; reason: "NOT_ACTIVE_MEMBER" };

/**
 * Who receives an event invitation when a member invites their group. Invitations only;
 * nobody is RSVP'd on anyone's behalf (AC4).
 */
export function selectEventInvitees(input: InviteSelectionInput): InviteSelection {
  const { callerId, members } = input;
  const caller = members.find((m) => m.userId === callerId);
  if (!caller || caller.status !== "active") return { ok: false, reason: "NOT_ACTIVE_MEMBER" };

  const others = members.filter((m) => m.userId !== callerId && m.status === "active").map((m) => m.userId);
  const rsvped = others.filter((id) => input.rsvpedUserIds.has(id));
  const blocked = others.filter((id) => !input.rsvpedUserIds.has(id) && isBlockedEitherWay(input.blocks, callerId, id));
  const excluded = new Set([...rsvped, ...blocked]);
  const alreadyInvited = others.filter((id) => !excluded.has(id) && input.alreadyInvitedIds.has(id));
  const skip = new Set([...excluded, ...alreadyInvited]);

  return {
    ok: true,
    inviteeIds: others.filter((id) => !skip.has(id)),
    skipped: { rsvped: rsvped.length, blocked: blocked.length, alreadyInvited: alreadyInvited.length },
  };
}
