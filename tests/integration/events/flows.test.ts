import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createTestDb, isDbAvailable, type TestDb } from "../support/db";
import { fakeSupabase } from "../support/fake-supabase";
import {
  createBusiness, createEvent, createGroup, createUser, rsvpAs, setConsent, setLocation, setPreferences,
} from "../support/factories";

const holder = vi.hoisted(() => ({ pool: null as unknown }));
vi.mock("@/features/events/server/stubs/clients", async () => {
  const { fakeSupabase: fake } = await import("../support/fake-supabase");
  return {
    createAdminClient: () => fake(holder.pool as never),
    createUserClient: async () => {
      throw new Error("tests pass user clients explicitly");
    },
  };
});

const available = await isDbAvailable();
const { getRecommendedEvents } = await import("@/features/events/server/recommended");
const { getEventPublic, getUpcomingEventsForUser } = await import("@/features/events/index");
const { completeEvent, submitFeedback } = await import("@/features/events/server/post-event");
const { getActivity } = await import("@/features/events/server/activity");
const { getNearbyBusinesses } = await import("@/features/events/server/nearby");
const { inviteGroupToEvent } = await import("@/features/events/server/invite-group");
const { cancelRsvp, reconfirmRsvp, rsvpToEvent } = await import("@/features/events/server/rsvp");
const { getEventDetail } = await import("@/features/events/server/detail");
const { listEventFeed } = await import("@/features/events/server/feed");

describe.skipIf(!available)("06 flows against Postgres", () => {
  let db: TestDb;
  let businessId: string;
  const asUser = (userId: string) => fakeSupabase(db.pool, userId) as unknown as SupabaseClient;

  beforeAll(async () => {
    db = await createTestDb();
    holder.pool = db.pool;
    businessId = await createBusiness(db.pool);
  });
  afterAll(async () => db?.drop());
  beforeEach(() => vi.unstubAllEnvs());

  it("AC1: a newly published pottery event leads the demo user's recommendations with an explanation", async () => {
    const viewer = await createUser(db.pool, "Demo");
    await setLocation(db.pool, viewer, 37.76, -122.42);
    await setPreferences(db.pool, viewer, { interests: ["pottery", "coffee"], categories: ["creative"], slots: ["thu_eve"], budgetMax: 3000 });
    await setConsent(db.pool, viewer, { allow_matching: true });
    await createEvent(db.pool, { businessId, title: "Trivia Tuesday", startsInHours: 30 });
    const pottery = await createEvent(db.pool, { businessId, title: "Beginner Pottery & Coffee Night", status: "approved_draft" });

    const before = await getRecommendedEvents(viewer, 10);
    await db.pool.query("update events set status = 'published' where id = $1", [pottery]);
    const after = await getRecommendedEvents(viewer, 10);

    expect(before.map((r) => r.event.id)).not.toContain(pottery);
    expect(after[0]!.event.id).toBe(pottery);
    expect(after[0]!.explanation).toMatch(/Beginner Pottery & Coffee Night fits your interests/);
    expect(after[0]!.score).toBeGreaterThan(after[1]!.score!);
  });

  it("serves the contracts and the detail page from the same rows", async () => {
    const eventId = await createEvent(db.pool, { businessId, capacity: 3 });
    const user = await createUser(db.pool);
    await rsvpAs(db, user, eventId);

    expect(await getEventPublic(eventId)).toMatchObject({ id: eventId, confirmedCount: 1, capacity: 3, rsvpStatus: null });
    const upcoming = await getUpcomingEventsForUser(user);
    expect(upcoming.find((e) => e.id === eventId)?.rsvpStatus).toBe("confirmed");
    const detail = await getEventDetail(user, eventId);
    expect(detail).toMatchObject({ confirmedCount: 1, myRsvp: { status: "confirmed" }, needsReconfirm: false });
  });

  it("runs RSVP, venue edit, reconfirm and cancel through the services", async () => {
    const eventId = await createEvent(db.pool, { businessId, capacity: 1 });
    const [first, second] = await Promise.all([createUser(db.pool), createUser(db.pool)]);

    await expect(rsvpToEvent(asUser(first), first, eventId, {})).resolves.toEqual({ status: "confirmed", eventStatus: "full" });
    await expect(rsvpToEvent(asUser(second), second, eventId, {})).rejects.toMatchObject({ code: "CAPACITY_FULL" });

    await db.pool.query("update events set starts_at = starts_at + interval '1 hour' where id = $1", [eventId]);
    expect((await getEventDetail(first, eventId)).needsReconfirm).toBe(true);
    await reconfirmRsvp(asUser(first), eventId);
    expect((await getEventDetail(first, eventId)).needsReconfirm).toBe(false);

    await expect(cancelRsvp(asUser(first), eventId)).resolves.toEqual({ eventStatus: "published" });
    const notes = await db.pool.query("select type from notifications where user_id = $1", [first]);
    expect(notes.rows.map((r) => r.type)).toEqual(["rsvp_confirmed"]);
  });

  it("P1 waitlist: joins when full, promotes on cancel and notifies the promoted user", async () => {
    vi.stubEnv("WAITLIST_ENABLED", "1");
    const eventId = await createEvent(db.pool, { businessId, capacity: 1 });
    const [holderUser, waiting] = await Promise.all([createUser(db.pool), createUser(db.pool)]);
    await rsvpToEvent(asUser(holderUser), holderUser, eventId, {});

    await expect(rsvpToEvent(asUser(waiting), waiting, eventId, {})).resolves.toEqual({ status: "waitlisted", eventStatus: "full" });
    expect((await getEventDetail(waiting, eventId)).waitlistEnabled).toBe(true);
    await cancelRsvp(asUser(holderUser), eventId);

    const { rows } = await db.pool.query("select status from rsvps where event_id = $1 and user_id = $2", [eventId, waiting]);
    expect(rows[0].status).toBe("confirmed");
    const notes = await db.pool.query("select payload from notifications where user_id = $1 and type = 'rsvp_confirmed'", [waiting]);
    expect(notes.rows.map((r) => r.payload)).toEqual([{ eventId, promotedFromWaitlist: true }]);
  });

  it("lets only the venue owner complete an event unless DEMO_MODE is on", async () => {
    const eventId = await createEvent(db.pool, { businessId });
    const stranger = await createUser(db.pool);
    const { rows } = await db.pool.query("select owner_id from businesses where id = $1", [businessId]);
    await db.pool.query("insert into profiles (id, display_name) values ($1, 'Owner') on conflict do nothing", [rows[0].owner_id]);

    await expect(completeEvent(stranger, eventId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await getEventDetail(stranger, eventId)).canComplete).toBe(false);
    expect((await getEventDetail(rows[0].owner_id, eventId)).canComplete).toBe(true);
    vi.stubEnv("DEMO_MODE", "1");
    expect((await getEventDetail(stranger, eventId)).canComplete).toBe(true);
    await expect(completeEvent(stranger, eventId)).resolves.toEqual({ status: "completed" });
    await expect(completeEvent(stranger, eventId)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("accepts feedback only from attendees of completed events", async () => {
    const eventId = await createEvent(db.pool, { businessId });
    const [attendee, outsider] = await Promise.all([createUser(db.pool), createUser(db.pool)]);
    await rsvpAs(db, attendee, eventId);

    await expect(submitFeedback(asUser(attendee), attendee, eventId, { rating: 5 })).rejects.toMatchObject({ code: "CONFLICT" });
    await db.pool.query("update events set status = 'completed' where id = $1", [eventId]);
    await expect(submitFeedback(asUser(outsider), outsider, eventId, { rating: 4 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await submitFeedback(asUser(attendee), attendee, eventId, { rating: 5, metSomeone: true, comment: "Great" });
    await submitFeedback(asUser(attendee), attendee, eventId, { rating: 4 });

    const { rows } = await db.pool.query("select rating, met_someone from event_feedback where event_id = $1", [eventId]);
    expect(rows).toEqual([{ rating: 4, met_someone: null }]);
  });

  it("builds the Activity hub: upcoming, past with feedback state, and group invitations", async () => {
    const [me, friend] = await Promise.all([createUser(db.pool, "Me"), createUser(db.pool, "Friend")]);
    const soon = await createEvent(db.pool, { businessId, title: "Upcoming Wheel Night" });
    const done = await createEvent(db.pool, { businessId, title: "Finished Glaze Class" });
    const invited = await createEvent(db.pool, { businessId, title: "Invited Mixer" });
    await rsvpAs(db, me, soon);
    await rsvpAs(db, me, done);
    await db.pool.query("update events set status = 'completed' where id = $1", [done]);
    const groupId = await createGroup(db.pool, friend, [[friend, "active"], [me, "active"]]);
    await inviteGroupToEvent(friend, invited, groupId);

    const activity = await getActivity(me);

    expect(activity.upcoming.map((e) => e.title)).toEqual(["Upcoming Wheel Night"]);
    expect(activity.past.map((e) => [e.title, e.feedbackGiven])).toEqual([["Finished Glaze Class", false]]);
    expect(activity.invitations).toEqual([
      expect.objectContaining({ groupId, sender: expect.objectContaining({ displayName: "Friend" }), event: expect.objectContaining({ id: invited }) }),
    ]);
    expect(activity.notifications.map((n) => n.type)).toContain("group_invite");
  });

  it("lists nearby venues with distance and next event, and filters the feed by radius", async () => {
    const viewer = await createUser(db.pool);
    await setLocation(db.pool, viewer, 37.77, -122.42); // ~1.1 km north of the venue
    const eventId = await createEvent(db.pool, { businessId, startsInHours: 1 });

    const nearby = await getNearbyBusinesses(viewer, 5);
    const near = nearby.find((b) => b.id === businessId)!;
    expect(near.distanceKm).toBe(1.1);
    expect(near.nextEvent?.id).toBe(eventId);
    expect(await getNearbyBusinesses(viewer, 0.1)).toEqual([]);

    const feed = await listEventFeed(viewer, { page: 1, limit: 50, radiusKm: 5 });
    expect(feed.items.map((e) => e.id)).toContain(eventId);
    const tiny = await listEventFeed(viewer, { page: 1, limit: 50, radiusKm: 0.1 });
    expect(tiny.items).toEqual([]);
  });
});
