import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { planRsvps, rsvpCandidates, seedEventsAndRsvps } from "../../../supabase/seed/06-events";
import { createTestDb, isDbAvailable, type TestDb } from "../support/db";
import { fakeSupabase } from "../support/fake-supabase";
import { createBusiness, createEvent, createUser } from "../support/factories";

vi.mock("server-only", () => ({}));

const available = await isDbAvailable();
const NAMES = ["maya", "jordan", "alex", "sam", "priya", "lee", "rosa", "theo", "nina", "omar", "demo.new", "demo"];

describe("seed planning", () => {
  it("never seeds RSVPs for demo or owner accounts", () => {
    const ids = rsvpCandidates({ "demo.new@commonground.test": "d1", "demo@commonground.test": "d2", "owner.kiln@commonground.test": "o", "maya@commonground.test": "m" });
    expect(ids).toEqual(["m"]);
  });

  it("fills the smallest event and gives the rest 3–8 attendees", () => {
    const events = [
      { id: "a", capacity: 20, starts_at: "" }, { id: "b", capacity: 6, starts_at: "" }, { id: "c", capacity: 12, starts_at: "" },
    ];
    const plan = planRsvps(events, Array.from({ length: 10 }, (_, i) => `u${i}`));
    expect(plan.map((p) => [p.eventId, p.userIds.length, p.full])).toEqual([["b", 6, true], ["c", 5, false], ["a", 7, false]]);
    expect(plan.every((p) => new Set(p.userIds).size === p.userIds.length)).toBe(true);
  });
});

describe.skipIf(!available)("seedEventsAndRsvps against Postgres", () => {
  let db: TestDb;
  const users: Record<string, string> = {};

  beforeAll(async () => {
    db = await createTestDb();
    for (const n of NAMES) users[`${n}@commonground.test`] = await createUser(db.pool, n, `${n}@commonground.test`);
    const kiln = await createBusiness(db.pool);
    await createBusiness(db.pool, "Ritual Grounds", "food_drink");
    for (const capacity of [6, 10, 12]) await createEvent(db.pool, { businessId: kiln, capacity });
  });
  afterAll(async () => db?.drop());

  it("seeds RSVPs, one full event, and the Scene 6 completed event; re-running adds nothing", async () => {
    const admin = fakeSupabase(db.pool) as unknown as SupabaseClient;

    const first = await seedEventsAndRsvps(admin, users);
    const second = await seedEventsAndRsvps(admin, users);

    expect(first.rsvps).toBeGreaterThan(0);
    expect(second).toEqual({ rsvps: 0, fullEventId: first.fullEventId, completedEventId: first.completedEventId });
    const { rows: full } = await db.pool.query("select status, capacity from events where id = $1", [first.fullEventId]);
    expect(full[0]).toEqual({ status: "full", capacity: 6 });
    const { rows: done } = await db.pool.query(
      "select e.status, e.starts_at < now() as past, count(r.*)::int as attendees from events e join rsvps r on r.event_id = e.id where e.id = $1 group by e.id",
      [first.completedEventId],
    );
    expect(done[0]).toEqual({ status: "completed", past: true, attendees: 6 });
    const { rows: reconnect } = await db.pool.query("select from_user_id, to_user_id from reconnect_interest");
    expect(reconnect).toEqual([{ from_user_id: users["maya@commonground.test"], to_user_id: users["jordan@commonground.test"] }]);
    const { rows: demo } = await db.pool.query("select count(*)::int as n from rsvps where user_id = any($1)", [
      [users["demo@commonground.test"], users["demo.new@commonground.test"]],
    ]);
    expect(demo[0].n).toBe(0);
  });
});
