import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, isDbAvailable, type TestDb } from "../support/db";
import { createBusiness, createEvent, createUser, rsvpAs, setEventStatus } from "../support/factories";

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ pool: null as unknown, userId: undefined as string | undefined }));
vi.mock("@/features/events/server/stubs/clients", async () => {
  const { fakeSupabase: fake } = await import("../support/fake-supabase");
  return {
    createAdminClient: () => fake(holder.pool as never),
    createUserClient: async () => fake(holder.pool as never, holder.userId),
  };
});

const available = await isDbAvailable();
const eventsRoute = await import("@/app/api/events/route");
const detailRoute = await import("@/app/api/events/[id]/route");
const rsvpRoute = await import("@/app/api/events/[id]/rsvp/route");
const attendeesRoute = await import("@/app/api/events/[id]/attendees/route");
const reconnectRoute = await import("@/app/api/events/[id]/reconnect/route");
const followUpRoute = await import("@/app/api/follow-ups/[id]/route");
const activityRoute = await import("@/app/api/activity/route");

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

async function call(handler: Handler, method: string, path: string, params: Record<string, string> = {}, body?: unknown) {
  const req = new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const res = await handler(req, { params: Promise.resolve(params) });
  return { status: res.status, json: await res.json() };
}

describe.skipIf(!available)("06 route handlers", () => {
  let db: TestDb;
  let businessId: string;

  beforeAll(async () => {
    db = await createTestDb();
    holder.pool = db.pool;
    businessId = await createBusiness(db.pool);
  });
  afterAll(async () => db?.drop());
  beforeEach(() => {
    holder.userId = undefined;
  });

  it("answers 401 in the shared envelope without a session", async () => {
    const res = await call(eventsRoute.GET, "GET", "/api/events");
    expect(res).toEqual({ status: 401, json: { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in to continue" } } });
  });

  it("validates ids, bodies and query strings", async () => {
    holder.userId = await createUser(db.pool);
    expect((await call(detailRoute.GET, "GET", "/api/events/nope", { id: "nope" })).status).toBe(400);
    const eventId = await createEvent(db.pool, { businessId });
    const bad = await call(rsvpRoute.POST, "POST", `/api/events/${eventId}/rsvp`, { id: eventId }, { shareWithAttendees: "yes" });
    expect(bad.status).toBe(400);
    expect(bad.json.error.code).toBe("VALIDATION");
    expect((await call(eventsRoute.GET, "GET", "/api/events?limit=500")).status).toBe(400);
  });

  it("paginates the feed with meta", async () => {
    holder.userId = await createUser(db.pool);
    await createEvent(db.pool, { businessId });
    const res = await call(eventsRoute.GET, "GET", "/api/events?page=1&limit=2");
    expect(res.status).toBe(200);
    expect(res.json.data.length).toBeLessThanOrEqual(2);
    expect(res.json.meta).toMatchObject({ page: 1, limit: 2 });
    expect(res.json.meta.total).toBeGreaterThanOrEqual(1);
  });

  it("RSVPs with 201, rejects duplicates and full events with 409, and cancels", async () => {
    const eventId = await createEvent(db.pool, { businessId, capacity: 1 });
    const [first, second] = await Promise.all([createUser(db.pool), createUser(db.pool)]);
    const path = `/api/events/${eventId}/rsvp`;

    holder.userId = first;
    const created = await call(rsvpRoute.POST, "POST", path, { id: eventId }, { shareWithAttendees: true });
    const duplicate = await call(rsvpRoute.POST, "POST", path, { id: eventId }, {});
    holder.userId = second;
    const full = await call(rsvpRoute.POST, "POST", path, { id: eventId }, {});
    holder.userId = first;
    const cancelled = await call(rsvpRoute.DELETE, "DELETE", path, { id: eventId });

    expect(created).toEqual({ status: 201, json: { ok: true, data: { status: "confirmed", eventStatus: "full" } } });
    expect([duplicate.status, duplicate.json.error.code]).toEqual([409, "CONFLICT"]);
    expect([full.status, full.json.error.code]).toEqual([409, "CAPACITY_FULL"]);
    expect(cancelled).toEqual({ status: 200, json: { ok: true, data: { eventStatus: "published" } } });
  });

  it("forbids the attendee list without an RSVP", async () => {
    const eventId = await createEvent(db.pool, { businessId });
    holder.userId = await createUser(db.pool);
    const res = await call(attendeesRoute.GET, "GET", `/api/events/${eventId}/attendees`, { id: eventId });
    expect([res.status, res.json.error.code]).toEqual([403, "FORBIDDEN"]);
  });

  it("Scene 6 over HTTP: mutual reconnect, both accept the follow-up, Activity reflects it", async () => {
    const eventId = await createEvent(db.pool, { businessId });
    const [maya, jordan] = await Promise.all([createUser(db.pool, "Maya"), createUser(db.pool, "Jordan")]);
    await rsvpAs(db, maya, eventId);
    await rsvpAs(db, jordan, eventId);
    await setEventStatus(db.pool, eventId, "completed");
    const path = `/api/events/${eventId}/reconnect`;

    holder.userId = maya;
    await call(reconnectRoute.POST, "POST", path, { id: eventId }, { toUserId: jordan });
    holder.userId = jordan;
    const mutual = await call(reconnectRoute.POST, "POST", path, { id: eventId }, { toUserId: maya });
    const suggestionId = mutual.json.data.suggestionId as string;
    const accept = (user: string) => {
      holder.userId = user;
      return call(followUpRoute.PATCH, "PATCH", `/api/follow-ups/${suggestionId}`, { id: suggestionId }, { action: "accept" });
    };
    const firstAccept = await accept(jordan);
    const activityWaiting = (await call(activityRoute.GET, "GET", "/api/activity")).json.data.followUps[0];
    const secondAccept = await accept(maya);

    expect(mutual.json.data.mutual).toBe(true);
    expect(firstAccept.json.data.status).toMatch(/^accepted_[ab]$/);
    expect(activityWaiting).toMatchObject({ iAccepted: true, theyAccepted: false, otherUser: { displayName: "Maya" } });
    expect(secondAccept.json.data.status).toBe("accepted_both");
  });
});
