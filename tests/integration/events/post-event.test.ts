import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, isDbAvailable, type TestDb } from "../support/db";
import { createBusiness, createEvent, createUser, setEventStatus } from "../support/factories";

const available = await isDbAvailable();

describe.skipIf(!available)("reconfirm and reconnect functions", () => {
  let db: TestDb;
  let businessId: string;

  beforeAll(async () => {
    db = await createTestDb();
    businessId = await createBusiness(db.pool);
  });
  afterAll(async () => db?.drop());

  const rsvp = (userId: string, eventId: string) =>
    db.asUser(userId, (c) => c.query("select * from rsvp_event($1, true, false)", [eventId]));
  const reconnect = (from: string, eventId: string, to: string) =>
    db.asUser(from, (c) =>
      c.query<{ mutual: boolean }>("select add_reconnect_interest($1, $2) as mutual", [eventId, to]).then(
        (r) => r.rows[0]!.mutual,
      ),
    );
  const needsReconfirm = async (eventId: string, userId: string) => {
    const { rows } = await db.pool.query("select needs_reconfirm from rsvps where event_id = $1 and user_id = $2", [
      eventId,
      userId,
    ]);
    return rows[0]!.needs_reconfirm as boolean;
  };

  async function completedEventWith(...users: string[]): Promise<string> {
    const eventId = await createEvent(db.pool, { businessId });
    for (const u of users) await rsvp(u, eventId);
    await setEventStatus(db.pool, eventId, "completed");
    return eventId;
  }

  it("flags confirmed RSVPs when the venue changes the time, and reconfirm clears it", async () => {
    const eventId = await createEvent(db.pool, { businessId });
    const user = await createUser(db.pool);
    await rsvp(user, eventId);

    await db.pool.query("update events set starts_at = starts_at + interval '30 minutes' where id = $1", [eventId]);
    expect(await needsReconfirm(eventId, user)).toBe(true);

    await db.asUser(user, (c) => c.query("select reconfirm_rsvp($1)", [eventId]));
    const { rows } = await db.pool.query(
      "select r.needs_reconfirm, r.event_version_seen = e.updated_at as current from rsvps r join events e on e.id = r.event_id where r.event_id = $1",
      [eventId],
    );
    expect(rows[0]).toEqual({ needs_reconfirm: false, current: true });
  });

  it("does not flag RSVPs for status-only updates such as flipping to full", async () => {
    const eventId = await createEvent(db.pool, { businessId });
    const user = await createUser(db.pool);
    await rsvp(user, eventId);

    await setEventStatus(db.pool, eventId, "full");
    await db.pool.query("update events set capacity = 1 where id = $1", [eventId]);

    expect(await needsReconfirm(eventId, user)).toBe(false);
  });

  it("refuses reconfirm without a confirmed RSVP", async () => {
    const eventId = await createEvent(db.pool, { businessId });
    const user = await createUser(db.pool);

    await expect(db.asUser(user, (c) => c.query("select reconfirm_rsvp($1)", [eventId]))).rejects.toThrow(
      "NOT_FOUND",
    );
  });

  it("requires the event to be completed", async () => {
    const [a, b] = await Promise.all([createUser(db.pool), createUser(db.pool)]);
    const eventId = await createEvent(db.pool, { businessId });
    await rsvp(a!, eventId);
    await rsvp(b!, eventId);

    await expect(reconnect(a!, eventId, b!)).rejects.toThrow("EVENT_NOT_COMPLETED");
  });

  it("requires both people to have attended", async () => {
    const [a, b, outsider] = await Promise.all([createUser(db.pool), createUser(db.pool), createUser(db.pool)]);
    const eventId = await completedEventWith(a!, b!);

    await expect(reconnect(a!, eventId, outsider!)).rejects.toThrow("NOT_ATTENDEES");
    await expect(reconnect(outsider!, eventId, a!)).rejects.toThrow("NOT_ATTENDEES");
  });

  it("reports mutual interest only once both sides have expressed it", async () => {
    const [a, b] = await Promise.all([createUser(db.pool), createUser(db.pool)]);
    const eventId = await completedEventWith(a!, b!);

    expect(await reconnect(a!, eventId, b!)).toBe(false);
    expect(await reconnect(a!, eventId, b!)).toBe(false);
    expect(await reconnect(b!, eventId, a!)).toBe(true);
  });

  it("detects mutual interest exactly once when both sides tap at the same time", async () => {
    for (let round = 0; round < 10; round++) {
      const [a, b] = await Promise.all([createUser(db.pool), createUser(db.pool)]);
      const eventId = await completedEventWith(a!, b!);

      const results = await Promise.all([reconnect(a!, eventId, b!), reconnect(b!, eventId, a!)]);

      expect(results.filter(Boolean)).toHaveLength(1);
    }
  });

  it("rejects reconnecting with yourself", async () => {
    const a = await createUser(db.pool);
    const eventId = await completedEventWith(a);

    await expect(reconnect(a, eventId, a)).rejects.toThrow("VALIDATION");
  });
});
