import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createTestDb, isDbAvailable, type TestDb } from "../support/db";
import { fakeSupabase } from "../support/fake-supabase";
import { createBusiness, createEvent, createGroup, createUser, rsvpAs } from "../support/factories";

const holder = vi.hoisted(() => ({ pool: null as unknown }));
vi.mock("@/features/events/server/stubs/clients", async () => {
  const { fakeSupabase: fake } = await import("../support/fake-supabase");
  return { createAdminClient: () => fake(holder.pool as never), createUserClient: async () => fake(holder.pool as never) };
});

const available = await isDbAvailable();
const { getNearbyBusinesses } = await import("@/features/events/server/nearby");
const { inviteGroupToEvent } = await import("@/features/events/server/invite-group");
const { getPublicGroups } = await import("@/features/events/server/stubs");
const { createFollowUp, respondToFollowUp } = await import("@/features/events/server/follow-ups");
const { getEventDetail } = await import("@/features/events/server/detail");
const { listEventFeed } = await import("@/features/events/server/feed");
const { expressReconnectInterest } = await import("@/features/events/server/post-event");

describe.skipIf(!available)("06 edge cases against Postgres", () => {
  let db: TestDb;
  let businessId: string;

  beforeAll(async () => {
    db = await createTestDb();
    holder.pool = db.pool;
    businessId = await createBusiness(db.pool);
  });
  afterAll(async () => db?.drop());

  async function pairAfterEvent() {
    const eventId = await createEvent(db.pool, { businessId });
    const [a, b] = await Promise.all([createUser(db.pool, "A"), createUser(db.pool, "B")]);
    await rsvpAs(db, a, eventId);
    await rsvpAs(db, b, eventId);
    await db.pool.query("update events set status = 'completed' where id = $1", [eventId]);
    return { eventId, a, b };
  }

  it("lists venues by name with no distance when the viewer has no location", async () => {
    const viewer = await createUser(db.pool);
    const list = await getNearbyBusinesses(viewer, 0.1);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((b) => b.distanceKm === null)).toBe(true);
  });

  it("ignores the radius filter on the feed when the viewer has no location", async () => {
    const viewer = await createUser(db.pool);
    const eventId = await createEvent(db.pool, { businessId });
    const page = await listEventFeed(viewer, { page: 1, limit: 50, radiusKm: 0.1 });
    expect(page.items.map((e) => e.id)).toContain(eventId);
  });

  it("filters the feed by category and date window", async () => {
    const viewer = await createUser(db.pool);
    const soon = await createEvent(db.pool, { businessId, startsInHours: 5 });
    const later = await createEvent(db.pool, { businessId, startsInHours: 24 * 30 });
    const week = await listEventFeed(viewer, { page: 1, limit: 50, to: new Date(Date.now() + 7 * 86_400_000).toISOString() });
    const games = await listEventFeed(viewer, { page: 1, limit: 50, category: "games" });
    expect(week.items.map((e) => e.id)).toContain(soon);
    expect(week.items.map((e) => e.id)).not.toContain(later);
    expect(games.items).toEqual([]);
  });

  it("refuses group invitations to events that are no longer live", async () => {
    const eventId = await createEvent(db.pool, { businessId, status: "cancelled" });
    const owner = await createUser(db.pool);
    const groupId = await createGroup(db.pool, owner, [[owner, "active"]]);
    await expect(inviteGroupToEvent(owner, eventId, groupId)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(inviteGroupToEvent(owner, crypto.randomUUID(), groupId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns public groups largest first", async () => {
    const [a, b, c] = await Promise.all([createUser(db.pool), createUser(db.pool), createUser(db.pool)]);
    const small = await createGroup(db.pool, a, [[a, "active"]]);
    const big = await createGroup(db.pool, b, [[b, "active"], [c, "active"], [a, "invited"]]);
    await db.pool.query("update groups set visibility = 'public' where id = any($1)", [[small, big]]);
    const groups = await getPublicGroups(10);
    expect(groups.slice(0, 2).map((g) => [g.id, g.memberCount])).toEqual([[big, 2], [small, 1]]);
  });

  it("dismisses follow-ups, rejects late changes and hides them from non-parties", async () => {
    const { eventId, a, b } = await pairAfterEvent();
    const outsider = await createUser(db.pool);
    const id = await createFollowUp(eventId, a, b);

    expect(await createFollowUp(eventId, b, a)).toBe(id);
    await expect(respondToFollowUp(outsider, id, "accept")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(respondToFollowUp(a, id, "dismiss")).resolves.toEqual({ status: "dismissed" });
    await expect(respondToFollowUp(b, id, "accept")).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("keeps a second accept by the same person idempotent", async () => {
    const { eventId, a, b } = await pairAfterEvent();
    const id = await createFollowUp(eventId, a, b);
    const first = await respondToFollowUp(a, id, "accept");
    expect(await respondToFollowUp(a, id, "accept")).toEqual(first);
  });

  it("reports one-sided reconnect interest without creating a suggestion", async () => {
    const { eventId, a, b } = await pairAfterEvent();
    const result = await expressReconnectInterest(fakeSupabase(db.pool, a) as unknown as SupabaseClient, a, eventId, b);
    expect(result).toEqual({ mutual: false, suggestionId: null });
    const { rows } = await db.pool.query("select count(*)::int as n from follow_up_suggestions where event_id = $1", [eventId]);
    expect(rows[0].n).toBe(0);
  });

  it("shows cancelled events but 404s drafts", async () => {
    const viewer = await createUser(db.pool);
    const cancelled = await createEvent(db.pool, { businessId, status: "cancelled" });
    const draft = await createEvent(db.pool, { businessId, status: "approved_draft" });
    expect((await getEventDetail(viewer, cancelled)).status).toBe("cancelled");
    await expect(getEventDetail(viewer, draft)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe.skipIf(!available)("P1 bookmarks against Postgres", () => {
  let db: TestDb;
  let businessId: string;

  beforeAll(async () => {
    db = await createTestDb();
    holder.pool = db.pool;
    businessId = await createBusiness(db.pool);
  });
  afterAll(async () => db?.drop());

  it("saves idempotently, unsaves, and lists saved events not already RSVP'd in Activity", async () => {
    const { setEventBookmark } = await import("@/features/events/server/bookmarks");
    const { getActivity } = await import("@/features/events/server/activity");
    const user = await createUser(db.pool);
    const client = fakeSupabase(db.pool, user) as unknown as SupabaseClient;
    const [saved, going, dropped] = await Promise.all([1, 2, 3].map(() => createEvent(db.pool, { businessId })));

    for (const id of [saved, going, dropped, saved]) await setEventBookmark(client, user, id!, true);
    await setEventBookmark(client, user, dropped!, false);
    await rsvpAs(db, user, going!);

    const activity = await getActivity(user);
    expect(activity.saved.map((e) => e.id)).toEqual([saved]);
    expect((await getEventDetail(user, saved!)).bookmarked).toBe(true);
    expect((await getEventDetail(user, dropped!)).bookmarked).toBe(false);
    await expect(setEventBookmark(client, user, crypto.randomUUID(), true)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
