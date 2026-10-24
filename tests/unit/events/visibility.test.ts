import { describe, expect, it } from "vitest";
import { buildAttendeeList, isBlockedEitherWay, type AttendeeRow, type ViewerContext } from "@/features/events/server/visibility";

const row = (overrides: Partial<AttendeeRow> = {}): AttendeeRow => ({
  userId: "u1",
  displayName: "Maya",
  avatarUrl: "https://img/maya.png",
  interests: ["pottery", "coffee", "hiking"],
  shareWithAttendees: true,
  shareInterestsWithAttendees: true,
  ...overrides,
});

const viewer = (overrides: Partial<ViewerContext> = {}): ViewerContext => ({
  userId: "viewer",
  interests: ["pottery", "coffee"],
  shareInterestsWithAttendees: true,
  connectionIds: new Set<string>(),
  blocks: [],
  ...overrides,
});

describe("attendee visibility matrix", () => {
  // consent × connection × block, one row per combination
  const cases: Array<{ share: boolean; connected: boolean; blocked: boolean; expected: "named" | "anonymous" | "hidden" }> = [
    { share: true, connected: true, blocked: false, expected: "named" },
    { share: true, connected: false, blocked: false, expected: "named" },
    { share: false, connected: true, blocked: false, expected: "anonymous" },
    { share: false, connected: false, blocked: false, expected: "anonymous" },
    { share: true, connected: true, blocked: true, expected: "hidden" },
    { share: true, connected: false, blocked: true, expected: "hidden" },
    { share: false, connected: true, blocked: true, expected: "hidden" },
    { share: false, connected: false, blocked: true, expected: "hidden" },
  ];

  it.each(cases)("share=$share connected=$connected blocked=$blocked → $expected", ({ share, connected, blocked, expected }) => {
    const ctx = viewer({
      connectionIds: new Set(connected ? ["u1"] : []),
      blocks: blocked ? [{ blockerId: "u1", blockedId: "viewer" }] : [],
    });
    const { attendees } = buildAttendeeList(ctx, [row({ shareWithAttendees: share })]);

    if (expected === "hidden") {
      expect(attendees).toEqual([]);
    } else if (expected === "anonymous") {
      expect(attendees).toEqual([{ isConnection: false }]);
    } else {
      expect(attendees[0]).toMatchObject({ userId: "u1", displayName: "Maya", isConnection: connected });
    }
  });

  it("hides attendees the viewer blocked as well as attendees who blocked the viewer", () => {
    const ctx = viewer({ blocks: [{ blockerId: "viewer", blockedId: "u1" }] });
    expect(buildAttendeeList(ctx, [row()]).attendees).toEqual([]);
  });

  it("shows shared interests only when both sides consent", () => {
    const both = buildAttendeeList(viewer(), [row()]).attendees[0];
    const attendeeOptOut = buildAttendeeList(viewer(), [row({ shareInterestsWithAttendees: false })]).attendees[0];
    const viewerOptOut = buildAttendeeList(viewer({ shareInterestsWithAttendees: false }), [row()]).attendees[0];

    expect(both?.sharedInterests).toEqual(["pottery", "coffee"]);
    expect(attendeeOptOut).not.toHaveProperty("sharedInterests");
    expect(viewerOptOut).not.toHaveProperty("sharedInterests");
  });

  it("never lists the viewer but counts every confirmed attendee, matching the capacity meter", () => {
    const rows = [row({ userId: "viewer" }), row({ userId: "u1" }), row({ userId: "u2", shareWithAttendees: false })];
    const ctx = viewer({ blocks: [{ blockerId: "viewer", blockedId: "u2" }] });

    const list = buildAttendeeList(ctx, rows);

    expect(list.count).toBe(3);
    expect(list.attendees).toHaveLength(1);
    expect(list.attendees[0]?.userId).toBe("u1");
  });

  it("lists connections first, then named attendees, then anonymous ones", () => {
    const rows = [
      row({ userId: "anon", shareWithAttendees: false }),
      row({ userId: "named", displayName: "Alex" }),
      row({ userId: "friend", displayName: "Jordan" }),
    ];
    const ctx = viewer({ connectionIds: new Set(["friend"]) });

    expect(buildAttendeeList(ctx, rows).attendees.map((a) => a.userId ?? "anonymous")).toEqual([
      "friend",
      "named",
      "anonymous",
    ]);
  });

  it("checks blocks in both directions", () => {
    expect(isBlockedEitherWay([{ blockerId: "a", blockedId: "b" }], "b", "a")).toBe(true);
    expect(isBlockedEitherWay([{ blockerId: "a", blockedId: "b" }], "a", "b")).toBe(true);
    expect(isBlockedEitherWay([{ blockerId: "a", blockedId: "c" }], "a", "b")).toBe(false);
  });
});
