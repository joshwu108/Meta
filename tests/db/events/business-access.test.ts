import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb, isDbAvailable, type TestDb } from "../support/db";
import { createBusiness, createEvent, createUser, rsvpAs } from "../support/factories";

vi.mock("server-only", () => ({}));

const available = await isDbAvailable();

describe.skipIf(!available)("business-facing RSVP reads", () => {
  let db: TestDb;
  let businessId: string;
  let ownerId: string;

  beforeAll(async () => {
    db = await createTestDb();
    businessId = await createBusiness(db.pool);
    ownerId = (await db.pool.query("select owner_id from businesses where id = $1", [businessId])).rows[0].owner_id;
  });
  afterAll(async () => db?.drop());

  async function rsvpWithVenueSharing(userId: string, eventId: string, shareWithBusiness: boolean) {
    await db.asUser(userId, (c) => c.query("select * from rsvp_event($1, false, $2)", [eventId, shareWithBusiness]));
  }

  it("names only attendees who shared with the venue, and only for the owner", async () => {
    const eventId = await createEvent(db.pool, { businessId });
    const [named, hidden, stranger] = await Promise.all([
      createUser(db.pool, "Named Guest"), createUser(db.pool, "Hidden Guest"), createUser(db.pool),
    ]);
    await rsvpWithVenueSharing(named, eventId, true);
    await rsvpWithVenueSharing(hidden, eventId, false);

    const { rows } = await db.asUser(ownerId, (c) => c.query("select * from business_event_attendees($1)", [eventId]));
    expect(rows).toEqual([
      { status: "confirmed", display_name: "Named Guest" },
      { status: "confirmed", display_name: null },
    ]);
    await expect(db.asUser(stranger, (c) => c.query("select * from business_event_attendees($1)", [eventId]))).rejects.toThrow(
      "NOT_FOUND",
    );
  });

  it("counts confirmed and waitlisted RSVPs only for the owner's events", async () => {
    const mine = await createEvent(db.pool, { businessId, capacity: 1 });
    const otherBusiness = await createBusiness(db.pool, "Meeple House", "games");
    const theirs = await createEvent(db.pool, { businessId: otherBusiness });
    const [a, b, c] = await Promise.all([createUser(db.pool), createUser(db.pool), createUser(db.pool)]);
    await rsvpAs(db, a, mine);
    await db.asUser(b, (cl) => cl.query("select * from rsvp_event($1, false, false, true)", [mine]));
    await rsvpAs(db, c, theirs);

    const { rows } = await db.asUser(ownerId, (cl) =>
      cl.query("select * from business_event_rsvp_counts($1)", [[mine, theirs]]),
    );

    expect(rows).toEqual([{ event_id: mine, confirmed: 1, waitlisted: 1 }]);
  });
});
