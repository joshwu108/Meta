import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createRlsRole, createTestDb, isDbAvailable, type RlsRole, type TestDb } from "../support/db";
import { createBusiness, createEvent, createUser, rsvpAs, setEventStatus } from "../support/factories";

vi.mock("server-only", () => ({}));

const available = await isDbAvailable();

describe.skipIf(!available)("06 row-level security (non-superuser role)", () => {
  let db: TestDb;
  let rls: RlsRole;
  let businessId: string;

  beforeAll(async () => {
    db = await createTestDb();
    rls = await createRlsRole(db);
    businessId = await createBusiness(db.pool);
  });
  afterAll(async () => {
    await db?.drop();
    await rls?.drop();
  });

  async function completedPair() {
    const eventId = await createEvent(db.pool, { businessId });
    const [a, b, outsider] = await Promise.all([createUser(db.pool), createUser(db.pool), createUser(db.pool)]);
    await rsvpAs(db, a, eventId);
    await rsvpAs(db, b, eventId);
    await setEventStatus(db.pool, eventId, "completed");
    return { eventId, a, b, outsider };
  }

  it("shows users only their own RSVPs and refuses direct inserts", async () => {
    const eventId = await createEvent(db.pool, { businessId });
    const [me, other] = await Promise.all([createUser(db.pool), createUser(db.pool)]);
    await rsvpAs(db, other, eventId);

    const seen = await rls.as(me, (c) => c.query("select user_id from rsvps where event_id = $1", [eventId]));
    expect(seen.rows).toEqual([]);
    await expect(
      rls.as(me, (c) => c.query("insert into rsvps (event_id, user_id) values ($1, $2)", [eventId, me])),
    ).rejects.toThrow(/row-level security/);
  });

  it("still lets users RSVP through the security-definer function", async () => {
    const eventId = await createEvent(db.pool, { businessId });
    const me = await createUser(db.pool);

    const { rows } = await rls.as(me, (c) => c.query("select * from rsvp_event($1, true, false)", [eventId]));

    expect(rows[0]).toMatchObject({ rsvp_status: "confirmed" });
    const mine = await rls.as(me, (c) => c.query("select status from rsvps where event_id = $1", [eventId]));
    expect(mine.rows).toEqual([{ status: "confirmed" }]);
  });

  it("accepts feedback only from confirmed attendees of a completed event", async () => {
    const { eventId, a, outsider } = await completedPair();
    const live = await createEvent(db.pool, { businessId });
    await rsvpAs(db, a, live);
    const insert = (user: string, event: string) =>
      rls.as(user, (c) => c.query("insert into event_feedback (event_id, user_id, rating) values ($1, $2, 5)", [event, user]));

    await expect(insert(outsider, eventId)).rejects.toThrow(/row-level security/);
    await expect(insert(a, live)).rejects.toThrow(/row-level security/);
    await expect(insert(a, eventId)).resolves.toBeDefined();
  });

  it("records reconnect interest only through the function", async () => {
    const { eventId, a, b } = await completedPair();

    await expect(
      rls.as(a, (c) => c.query("insert into reconnect_interest (event_id, from_user_id, to_user_id) values ($1, $2, $3)", [eventId, a, b])),
    ).rejects.toThrow(/row-level security/);
    await rls.as(a, (c) => c.query("select add_reconnect_interest($1, $2)", [eventId, b]));
    const mine = await rls.as(a, (c) => c.query("select to_user_id from reconnect_interest where event_id = $1", [eventId]));
    const theirs = await rls.as(b, (c) => c.query("select to_user_id from reconnect_interest where event_id = $1", [eventId]));
    expect(mine.rows).toEqual([{ to_user_id: b }]);
    expect(theirs.rows).toEqual([]);
  });

  it("shows a follow-up suggestion to its two people and nobody else", async () => {
    const { eventId, a, b, outsider } = await completedPair();
    const [userA, userB] = a < b ? [a, b] : [b, a];
    await db.pool.query(
      "insert into follow_up_suggestions (event_id, user_a, user_b, suggestion) values ($1, $2, $3, '{}')",
      [eventId, userA, userB],
    );
    const visible = (user: string) =>
      rls.as(user, (c) => c.query("select count(*)::int as n from follow_up_suggestions where event_id = $1", [eventId]));

    expect((await visible(a)).rows[0].n).toBe(1);
    expect((await visible(b)).rows[0].n).toBe(1);
    expect((await visible(outsider)).rows[0].n).toBe(0);
  });

  it("keeps bookmarks private to their owner", async () => {
    const eventId = await createEvent(db.pool, { businessId });
    const [me, other] = await Promise.all([createUser(db.pool), createUser(db.pool)]);
    await rls.as(me, (c) => c.query("insert into bookmarks (user_id, target_type, target_id) values ($1, 'event', $2)", [me, eventId]));

    const theirs = await rls.as(other, (c) => c.query("select count(*)::int as n from bookmarks"));
    expect(theirs.rows[0].n).toBe(0);
    await expect(
      rls.as(other, (c) => c.query("insert into bookmarks (user_id, target_type, target_id) values ($1, 'event', $2)", [me, eventId])),
    ).rejects.toThrow(/row-level security/);
  });
});
