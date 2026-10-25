import { describe, expect, it } from "vitest";
import { cardStatus } from "@/features/events/components/card-status";
import { invitableGroups } from "@/features/events/components/invite-groups";

const base = { status: "published" as const, needsReconfirm: false, rsvpStatus: null, isFull: false };

describe("cardStatus", () => {
  it.each([
    [{ ...base, status: "cancelled" as const, rsvpStatus: "confirmed" as const, needsReconfirm: true }, { kind: "status", status: "cancelled" }],
    [{ ...base, status: "completed" as const, rsvpStatus: "confirmed" as const }, { kind: "status", status: "completed" }],
    [{ ...base, needsReconfirm: true, rsvpStatus: "confirmed" as const }, { kind: "reconfirm" }],
    [{ ...base, rsvpStatus: "waitlisted" as const, isFull: true }, { kind: "status", status: "waitlisted" }],
    [{ ...base, rsvpStatus: "confirmed" as const }, { kind: "status", status: "confirmed" }],
    [{ ...base, status: "full" as const, isFull: true }, { kind: "status", status: "full" }],
    [{ ...base, rsvpStatus: "cancelled" as const }, null],
    [base, null],
  ])("%o → %o", (event, expected) => {
    expect(cardStatus(event)).toEqual(expected);
  });
});

describe("invitableGroups", () => {
  it("offers only groups where the viewer is an active member", () => {
    expect(
      invitableGroups([
        { id: "a", name: "Mission Makers", myStatus: "active" },
        { id: "b", name: "Thursday Crew", myStatus: "invited" },
        { id: "c", name: "Old Group", myStatus: null },
      ]),
    ).toEqual([{ id: "a", name: "Mission Makers" }]);
  });
});
