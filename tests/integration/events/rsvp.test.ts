import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, isDbAvailable, type TestDb } from "../support/db";
import { confirmedCount, createBusiness, createEvent, createUser, eventStatus } from "../support/factories";

const available = await isDbAvailable();

describe.skipIf(!available)("rsvp_event / cancel_rsvp", () => {
  let db: TestDb;
  let businessId: string;

  beforeAll(async () => {
    db = await createTestDb();
    businessId = await createBusiness(db.pool);
  });
  afterAll(async () => db?.drop());

  const rsvp = (userId: string, eventId: string, allowWaitlist = false) =>
    db.asUser(userId, (c) =>
      c.query("select * from rsvp_event($1, true, false, $2)", [eventId, allowWaitlist]).then((r) => r.rows[0]),
    );
  const cancel = (userId: string, eventId: string) =>
    db.asUser(userId, (c) => c.query("select * from cancel_rsvp($1)", [eventId]).then((r) => r.rows[0]));

  it("confirms exactly capacity under 20 concurrent RSVPs and flips the event to full", async () => {
    const eventId = await createEvent(db.pool, { businessId, capacity: 10 });
    const users = await Promise.all(Array.from({ length: 20 }, (_, i) => createUser(db.pool, `Racer ${i}`)));

    const results = await Promise.allSettled(users.map((u) => rsvp(u, eventId)));

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(fulfilled).toHaveLength(10);
    expect(rejected).toHaveLength(10);
    expect(rejected.every((r) => String(r.reason.message).includes("CAPACITY_FULL"))).toBe(true);
    expect(await confirmedCount(db.pool, eventId)).toBe(10);
    expect(await eventStatus(db.pool, eventId)).toBe("full");
  });

  it("reopens a full event when a confirmed attendee cancels", async () => {
    const eventId = await createEvent(db.pool, { businessId, capacity: 2 });
    const [a, b] = await Promise.all([createUser(db.pool), createUser(db.pool)]);
    await rsvp(a!, eventId);
    const second = await rsvp(b!, eventId);
    expect(second).toEqual({ rsvp_status: "confirmed", event_status: "full" });

    const cancelled = await cancel(a!, eventId);

    expect(cancelled).toMatchObject({ cancelled: true, promoted_user_id: null, event_status: "published" });
    expect(await confirmedCount(db.pool, eventId)).toBe(1);
  });

  it("lets a cancelled attendee RSVP again with fresh sharing choices", async () => {
    const eventId = await createEvent(db.pool, { businessId });
    const user = await createUser(db.pool);
    await rsvp(user, eventId);
    await cancel(user, eventId);

    await db.asUser(user, (c) => c.query("select * from rsvp_event($1, false, true)", [eventId]));

    const { rows } = await db.pool.query(
      "select status, share_with_attendees, share_with_business from rsvps where event_id = $1 and user_id = $2",
      [eventId, user],
    );
    expect(rows[0]).toEqual({ status: "confirmed", share_with_attendees: false, share_with_business: true });
  });

  it("rejects a second RSVP from the same user with ALREADY_RSVPED", async () => {
    const eventId = await createEvent(db.pool, { businessId });
    const user = await createUser(db.pool);
    await rsvp(user, eventId);

    await expect(rsvp(user, eventId)).rejects.toThrow("ALREADY_RSVPED");
  });

  it.each(["approved_draft", "cancelled", "completed"])("rejects RSVPs on %s events", async (status) => {
    const eventId = await createEvent(db.pool, { businessId, status });
    const user = await createUser(db.pool);

    await expect(rsvp(user, eventId)).rejects.toThrow("EVENT_NOT_OPEN");
  });

  it("rejects RSVPs on events that already started", async () => {
    const eventId = await createEvent(db.pool, { businessId, startsInHours: -1 });
    const user = await createUser(db.pool);

    await expect(rsvp(user, eventId)).rejects.toThrow("EVENT_STARTED");
  });

  it("rejects anonymous callers", async () => {
    const eventId = await createEvent(db.pool, { businessId });

    await expect(db.pool.query("select * from rsvp_event($1, true, false)", [eventId])).rejects.toThrow(
      "UNAUTHENTICATED",
    );
  });

  it("waitlists when allowed and promotes the oldest waitlisted RSVP on cancel", async () => {
    const eventId = await createEvent(db.pool, { businessId, capacity: 1 });
    const [a, b, c] = await Promise.all([createUser(db.pool), createUser(db.pool), createUser(db.pool)]);
    await rsvp(a!, eventId);
    expect(await rsvp(b!, eventId, true)).toEqual({ rsvp_status: "waitlisted", event_status: "full" });
    await rsvp(c!, eventId, true);

    const cancelled = await cancel(a!, eventId);

    expect(cancelled).toMatchObject({ cancelled: true, promoted_user_id: b, event_status: "full" });
    expect(await confirmedCount(db.pool, eventId)).toBe(1);
  });

  it("reports cancelled=false when there is nothing to cancel", async () => {
    const eventId = await createEvent(db.pool, { businessId });
    const user = await createUser(db.pool);

    expect(await cancel(user, eventId)).toMatchObject({ cancelled: false, event_status: "published" });
  });
});
