import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createTestDb, isDbAvailable, type TestDb } from "../support/db";
import { clientState } from "../support/state";
import { fakeSupabase } from "../support/fake-supabase";
import { createBusiness, createEvent, createGroup, createUser, rsvpAs, setEventStatus } from "../support/factories";

vi.mock("server-only", () => ({}));


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
    clientState.pool = db.pool;
    businessId = await createBusiness(db.pool);
  });
  afterAll(async () => db?.drop());

  async function pairAfterEvent() {
    const eventId = await createEvent(db.pool, { businessId });
    const [a, b] = await Promise.all([createUser(db.pool, "A"), createUser(db.pool, "B")]);
    await rsvpAs(db, a, eventId);
    await rsvpAs(db, b, eventId);
    await setEventStatus(db.pool, eventId, "completed");
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

  it("asks the agent for the suggestion only when both people consent, logging one action each", async () => {
    const { setConsent, setPreferences } = await import("../support/factories");
    const consenting = await pairAfterEvent();
    for (const u of [consenting.a, consenting.b]) {
      await setPreferences(db.pool, u, { interests: ["coffee"], categories: ["food_drink"], slots: ["sun_day", "thu_eve"] });
      await setConsent(db.pool, u, { allow_matching: true });
    }
    const private_ = await pairAfterEvent();

    await createFollowUp(consenting.eventId, consenting.a, consenting.b);
    await createFollowUp(private_.eventId, private_.a, private_.b);

    const { rows } = await db.pool.query(
      `select f.event_id, f.suggestion->>'suggestedSlot' as slot,
              (select count(*)::int from agent_action_log l
                where l.user_id in (f.user_a, f.user_b) and l.action = 'follow_up_suggestion') as logs,
              (select count(*)::int from agent_action_log l
                where l.user_id in (f.user_a, f.user_b) and l.action = 'share_preferences') as shares
       from follow_up_suggestions f where f.event_id = any($1)`,
      [[consenting.eventId, private_.eventId]],
    );
    const byEvent = new Map(rows.map((r) => [r.event_id, r]));
    // 02's consent boundary also records one share_preferences row per person it releases.
    // The slot has to be one the two actually share — which of them 02 picks is 02's business.
    expect(byEvent.get(consenting.eventId)).toMatchObject({ logs: 2, shares: 2 });
    expect(["sun_day", "thu_eve"]).toContain(byEvent.get(consenting.eventId)!.slot);
    expect(byEvent.get(private_.eventId)).toMatchObject({ slot: "sat_day", logs: 0, shares: 0 });
    // The card renders "<title> at <venue>, <slot phrase>", so the title must not carry the slot.
    const { rows: titles } = await db.pool.query(
      "select event_id, suggestion->>'title' as title from follow_up_suggestions where event_id = any($1)",
      [[consenting.eventId, private_.eventId]],
    );
    for (const { title } of titles as Array<{ title: string }>) {
      expect(title.length).toBeGreaterThan(0);
      expect(title, "the card adds the slot phrase itself").not.toMatch(
        /\b(morning|afternoon|evening|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
      );
    }
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
    clientState.pool = db.pool;
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

describe.skipIf(!available)("id lists longer than one PostgREST chunk", () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestDb();
    clientState.pool = db.pool;
  });
  afterAll(async () => db?.drop());

  it("counts, cards and previews stay complete across chunk boundaries", async () => {
    const { confirmedCounts, getEventsByIds, profilePreviews } = await import("@/features/events/server/repo");
    const businessId = await createBusiness(db.pool);
    const ids: string[] = [];
    for (let i = 0; i < 130; i++) ids.push(await createEvent(db.pool, { businessId }));
    const [a, b] = await Promise.all([createUser(db.pool, "A"), createUser(db.pool, "B")]);
    await rsvpAs(db, a, ids[0]!);
    await rsvpAs(db, b, ids[129]!);
    const admin = fakeSupabase(db.pool) as unknown as SupabaseClient;

    const counts = await confirmedCounts(admin, ids);
    const rows = await getEventsByIds(admin, ids);
    const people = await profilePreviews(admin, [a, b, ...Array.from({ length: 150 }, () => crypto.randomUUID())]);

    expect(counts.size).toBe(130);
    expect([counts.get(ids[0]!), counts.get(ids[129]!), counts.get(ids[64]!)]).toEqual([1, 1, 0]);
    expect(rows).toHaveLength(130);
    expect([...people.values()].map((p) => p.displayName).sort()).toEqual(["A", "B"]);
  });
});
