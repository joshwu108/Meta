import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfirmedAttendee, MyRsvp } from "@/features/events/server/repo";
import { eventRow, uid } from "./fixtures";

vi.mock("server-only", () => ({}));

const VIEWER = uid(1);
const FRIEND = uid(2);
const STRANGER = uid(3);
const BLOCKER = uid(4);
const SHY = uid(5);

const state = {
  rows: [eventRow()],
  mine: new Map<string, MyRsvp>(),
  attendees: [] as ConfirmedAttendee[],
  prefs: null as unknown,
  explanations: 0,
  sharingCalls: 0,
};

vi.mock("@/features/events/server/stubs", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createAdminClient: () => ({}),
  getConnectionIds: async () => new Set([FRIEND]),
  getBlockEdges: async () => [{ blockerId: BLOCKER, blockedId: VIEWER }],
  getAttendeeSharing: async (ids: string[]) => {
    state.sharingCalls += 1;
    return new Map(ids.map((id) => [id, { interests: ["pottery", "coffee"], shareInterestsWithAttendees: id !== STRANGER }]));
  },
  getSharablePreferences: async () => state.prefs,
  explainRecommendation: async () => {
    state.explanations += 1;
    return "Pottery fits your interests on a Thursday evening.";
  },
}));

vi.mock("@/features/events/server/repo", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getVisibleEvent: async (_db: unknown, id: string) => state.rows.find((r) => r.id === id) ?? null,
  listLiveEventsBetween: async () => state.rows,
  confirmedCounts: async (_db: unknown, ids: string[]) => new Map(ids.map((id) => [id, state.attendees.length])),
  myRsvps: async (_db: unknown, _u: string, ids?: string[]) =>
    new Map([...state.mine].filter(([id]) => !ids || ids.includes(id))),
  confirmedAttendees: async () => state.attendees,
  friendsGoing: async () => new Map([[eventRow().id, [FRIEND]]]),
  profilePreviews: async (_db: unknown, ids: string[]) =>
    new Map(ids.map((id) => [id, { userId: id, displayName: "Friend", avatarUrl: null }])),
  viewerLocation: async () => ({ lat: 37.76, lng: -122.42 }),
  eventsForUser: async () => [],
}));

vi.mock("@/features/events/server/bookmarks", () => ({ bookmarkedEventIds: async () => new Set<string>() }));
vi.mock("@/features/events/server/post-event", () => ({ canComplete: async () => false }));

const { getAttendeeList } = await import("@/features/events/server/attendees");
const { getEventDetail } = await import("@/features/events/server/detail");
const { getEventPublic, getUpcomingEventsForUser } = await import("@/features/events/index");
const { getRecommendedEvents } = await import("@/features/events/index");

const EVENT = eventRow().id;
const confirmedMine = (): MyRsvp => ({
  eventId: EVENT, status: "confirmed", needsReconfirm: true, shareWithAttendees: true, shareWithBusiness: false,
});
const attendee = (userId: string, share = true): ConfirmedAttendee => ({
  userId, shareWithAttendees: share, displayName: share ? `User ${userId.slice(-1)}` : null, avatarUrl: null,
});

beforeEach(() => {
  state.rows = [eventRow()];
  state.mine = new Map();
  state.attendees = [attendee(VIEWER), attendee(FRIEND), attendee(STRANGER), attendee(BLOCKER), attendee(SHY, false)];
  state.prefs = null;
  state.explanations = 0;
});

describe("getAttendeeList", () => {
  it("is forbidden without a confirmed RSVP", async () => {
    await expect(getAttendeeList(VIEWER, EVENT)).rejects.toMatchObject({ code: "FORBIDDEN" });
    state.mine = new Map([[EVENT, { ...confirmedMine(), status: "waitlisted" }]]);
    await expect(getAttendeeList(VIEWER, EVENT)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("hides non-consenting names and blocked users, and gates shared interests on both consents", async () => {
    state.mine = new Map([[EVENT, confirmedMine()]]);

    const list = await getAttendeeList(VIEWER, EVENT);

    expect(list.count).toBe(5);
    expect(list.attendees).toEqual([
      { userId: FRIEND, displayName: "User 2", avatarUrl: null, isConnection: true, sharedInterests: ["pottery", "coffee"] },
      { userId: STRANGER, displayName: "User 3", avatarUrl: null, isConnection: false },
      { isConnection: false },
    ]);
  });
});

describe("getEventDetail", () => {
  it("404s for unknown or draft events", async () => {
    await expect(getEventDetail(VIEWER, uid(99))).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("shows only connections in the preview before the viewer RSVPs", async () => {
    const detail = await getEventDetail(VIEWER, EVENT);

    expect(detail.myRsvp).toBeNull();
    expect(detail.needsReconfirm).toBe(false);
    expect(detail.attendeePreview).toEqual({ count: 5, avatars: [expect.objectContaining({ userId: FRIEND })] });
    expect(detail.venue).toMatchObject({ name: "Kiln & Cup", lat: 37.7599 });
  });

  it("shows every consented attendee and the reconfirm flag once confirmed", async () => {
    state.mine = new Map([[EVENT, confirmedMine()]]);

    const detail = await getEventDetail(VIEWER, EVENT);

    expect(detail.rsvpStatus).toBe("confirmed");
    expect(detail.needsReconfirm).toBe(true);
    expect(detail.attendeePreview.avatars.map((a) => a.userId)).toEqual([FRIEND, STRANGER]);
  });

  it("never puts interests in the preview or asks 02 to release them", async () => {
    state.sharingCalls = 0;
    const detail = await getEventDetail(VIEWER, EVENT);

    expect(detail.attendeePreview.avatars.every((a) => a.sharedInterests === undefined)).toBe(true);
    expect(state.sharingCalls).toBe(0);
  });
});

describe("contracts", () => {
  it("getEventPublic returns the public shape without a viewer RSVP", async () => {
    const event = await getEventPublic(EVENT);
    expect(event).toMatchObject({ id: EVENT, confirmedCount: 5, rsvpStatus: null, business: { name: "Kiln & Cup" } });
    expect(await getEventPublic(uid(99))).toBeNull();
  });

  it("getUpcomingEventsForUser lists live events with the user's RSVP status", async () => {
    state.mine = new Map([[EVENT, confirmedMine()]]);
    const later = eventRow({ id: uid(77), starts_at: "2099-11-30T02:00:00Z" });
    state.rows = [later, eventRow()];

    const events = await getUpcomingEventsForUser(VIEWER);

    expect(events.map((e) => [e.id, e.rsvpStatus])).toEqual([[EVENT, "confirmed"], [later.id, null]]);
  });
});

describe("getRecommendedEvents", () => {
  it("falls back to a non-personalized order and generic copy without matching consent", async () => {
    const [first] = await getRecommendedEvents(VIEWER, 10);
    expect(first).toMatchObject({ score: null, breakdown: null, explanation: "Coming up soon near you." });
    expect(first!.event.friendsGoing).toEqual([{ userId: FRIEND, displayName: "Friend", avatarUrl: null }]);
    expect(state.explanations).toBe(0);
  });

  it("scores, explains and caches explanations per viewer, event and preferences", async () => {
    state.prefs = {
      userId: VIEWER, interests: ["pottery"], interestCategories: ["creative"], availabilitySlots: ["thu_eve"],
      socialGoals: [], groupSizePref: "medium", budgetMin: null, budgetMax: 3000, travelRadiusKm: 5,
      activityPrefs: [], coarseLat: 37.76, coarseLng: -122.42, neighborhood: "Mission",
    };

    const [first] = await getRecommendedEvents(VIEWER, 10);
    await getRecommendedEvents(VIEWER, 10);

    expect(first!.score).toBeGreaterThan(90);
    expect(first!.event).toMatchObject({ title: "Beginner Pottery & Coffee Night", description: "Learn the wheel with coffee." });
    expect(first!.explanation).toBe("Pottery fits your interests on a Thursday evening.");
    expect(state.explanations).toBe(1);
  });
});
