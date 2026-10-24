import { describe, expect, it, vi } from "vitest";
import { selectEventInvitees, type GroupMember } from "@/features/events/server/invite";

vi.mock("server-only", () => ({}));

const members: GroupMember[] = [
  { userId: "caller", status: "active" },
  { userId: "ana", status: "active" },
  { userId: "ben", status: "active" },
  { userId: "cy", status: "active" },
  { userId: "dee", status: "invited" },
  { userId: "eli", status: "left" },
  { userId: "fay", status: "active" },
];

describe("selectEventInvitees", () => {
  it("invites other active members only", () => {
    const result = selectEventInvitees({ callerId: "caller", members, rsvpedUserIds: new Set(), blocks: [], alreadyInvitedIds: new Set() });
    expect(result).toEqual({ ok: true, inviteeIds: ["ana", "ben", "cy", "fay"], skipped: { rsvped: 0, blocked: 0, alreadyInvited: 0 } });
  });

  it("skips members who already RSVP'd, are blocked either way, or already hold an invite", () => {
    const result = selectEventInvitees({
      callerId: "caller",
      members,
      rsvpedUserIds: new Set(["ana"]),
      blocks: [
        { blockerId: "ben", blockedId: "caller" },
        { blockerId: "caller", blockedId: "cy" },
      ],
      alreadyInvitedIds: new Set(["fay"]),
    });
    expect(result).toEqual({ ok: true, inviteeIds: [], skipped: { rsvped: 1, blocked: 2, alreadyInvited: 1 } });
  });

  it("forbids callers who are not active members", () => {
    const outsider = selectEventInvitees({ callerId: "zed", members, rsvpedUserIds: new Set(), blocks: [], alreadyInvitedIds: new Set() });
    const pending = selectEventInvitees({ callerId: "dee", members, rsvpedUserIds: new Set(), blocks: [], alreadyInvitedIds: new Set() });
    expect(outsider).toEqual({ ok: false, reason: "NOT_ACTIVE_MEMBER" });
    expect(pending).toEqual({ ok: false, reason: "NOT_ACTIVE_MEMBER" });
  });
});
