import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createTestDb, isDbAvailable, type TestDb } from "../support/db";
import { clientState } from "../support/state";
import { fakeSupabase } from "../support/fake-supabase";
import {
  block, connect, createBusiness, createEvent, createGroup, createUser, rsvpAs, setConsent, setEventStatus,
} from "../support/factories";

vi.mock("server-only", () => ({}));


const available = await isDbAvailable();
const { getAttendeeList } = await import("@/features/events/server/attendees");
const { expressReconnectInterest } = await import("@/features/events/server/post-event");
const { listFollowUps } = await import("@/features/events/server/follow-ups");
const { inviteGroupToEvent } = await import("@/features/events/server/invite-group");

describe.skipIf(!available)("06 services against Postgres", () => {
  let db: TestDb;
  let businessId: string;
  const asUser = (userId: string) => fakeSupabase(db.pool, userId) as unknown as SupabaseClient;
  const count = async (sql: string, params: unknown[]) => Number((await db.pool.query(sql, params)).rows[0].n);

  beforeAll(async () => {
    db = await createTestDb();
    clientState.pool = db.pool;
    businessId = await createBusiness(db.pool);
  });
  afterAll(async () => db?.drop());

  describe("attendees", () => {
    it("forbids the list without a confirmed RSVP, hides non-consenting names and blocked users", async () => {
      const eventId = await createEvent(db.pool, { businessId });
      const [viewer, named, shy, blocker] = await Promise.all([
        createUser(db.pool, "Viewer"), createUser(db.pool, "Named"), createUser(db.pool, "Shy"), createUser(db.pool, "Blocker"),
      ]);
      await rsvpAs(db, named, eventId);
      await rsvpAs(db, shy, eventId, false);
      await rsvpAs(db, blocker, eventId);
      await block(db.pool, blocker, viewer);

      await expect(getAttendeeList(viewer, eventId)).rejects.toMatchObject({ code: "FORBIDDEN" });

      await rsvpAs(db, viewer, eventId);
      const list = await getAttendeeList(viewer, eventId);

      expect(list.count).toBe(4);
      expect(list.attendees).toEqual([
        { userId: named, displayName: "Named", avatarUrl: null, isConnection: false },
        { isConnection: false },
      ]);
    });
  });

  describe("reconnect", () => {
    it("creates one suggestion and two notifications on mutual interest, visible only to the pair", async () => {
      const eventId = await createEvent(db.pool, { businessId });
      const [maya, jordan, other] = await Promise.all([createUser(db.pool, "Maya"), createUser(db.pool, "Jordan"), createUser(db.pool)]);
      for (const u of [maya, jordan, other]) await rsvpAs(db, u, eventId);
      await setEventStatus(db.pool, eventId, "completed");

      const first = await expressReconnectInterest(asUser(maya), maya, eventId, jordan);
      const second = await expressReconnectInterest(asUser(jordan), jordan, eventId, maya);
      await expressReconnectInterest(asUser(jordan), jordan, eventId, maya);

      expect(first).toEqual({ mutual: false, suggestionId: null });
      expect(second.mutual).toBe(true);
      expect(await count("select count(*) as n from follow_up_suggestions where event_id = $1", [eventId])).toBe(1);
      expect(await count(
        "select count(*) as n from notifications where type = 'reconnect_suggestion' and payload->>'eventId' = $1 and payload->>'href' = '/activity'", [eventId],
      )).toBe(2);
      expect((await listFollowUps(maya)).map((f) => f.otherUser?.displayName)).toEqual(["Jordan"]);
      expect((await listFollowUps(jordan)).map((f) => f.otherUser?.displayName)).toEqual(["Maya"]);
      expect(await listFollowUps(other)).toEqual([]);
    });

    it("refuses non-attendees and hides blocks behind the same error", async () => {
      const eventId = await createEvent(db.pool, { businessId });
      const [a, b, outsider] = await Promise.all([createUser(db.pool), createUser(db.pool), createUser(db.pool)]);
      await rsvpAs(db, a, eventId);
      await rsvpAs(db, b, eventId);
      await setEventStatus(db.pool, eventId, "completed");
      await block(db.pool, b, a);

      await expect(expressReconnectInterest(asUser(a), a, eventId, outsider)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(expressReconnectInterest(asUser(a), a, eventId, b)).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("invite a group", () => {
    it("invites active members only, skipping RSVP'd and blocked members, and never RSVPs anyone", async () => {
      const eventId = await createEvent(db.pool, { businessId });
      const [caller, fresh, going, blocked, pending] = await Promise.all(
        Array.from({ length: 5 }, () => createUser(db.pool)),
      );
      const groupId = await createGroup(db.pool, caller!, [
        [caller!, "active"], [fresh!, "active"], [going!, "active"], [blocked!, "active"], [pending!, "invited"],
      ]);
      await rsvpAs(db, going!, eventId);
      await block(db.pool, caller!, blocked!);

      const result = await inviteGroupToEvent(caller!, eventId, groupId);
      const again = await inviteGroupToEvent(caller!, eventId, groupId);

      expect(result).toEqual({ invited: 1, skipped: { rsvped: 1, blocked: 1, alreadyInvited: 0 } });
      expect(again).toEqual({ invited: 0, skipped: { rsvped: 1, blocked: 1, alreadyInvited: 1 } });
      expect(await count("select count(*) as n from invitations where event_id = $1 and recipient_id = $2 and kind = 'event'", [eventId, fresh])).toBe(1);
      expect(await count("select count(*) as n from rsvps where event_id = $1", [eventId])).toBe(1);
    });

    it("forbids callers who are not active members", async () => {
      const eventId = await createEvent(db.pool, { businessId });
      const [owner, outsider] = await Promise.all([createUser(db.pool), createUser(db.pool)]);
      const groupId = await createGroup(db.pool, owner, [[owner, "active"]]);
      await setConsent(db.pool, outsider, {});

      await expect(inviteGroupToEvent(outsider, eventId, groupId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  it("treats accepted connections as friends going only when they share", async () => {
    const { buildEventCards } = await import("@/features/events/server/cards");
    const { getVisibleEvent } = await import("@/features/events/server/repo");
    const eventId = await createEvent(db.pool, { businessId });
    const [viewer, friend, privateFriend] = await Promise.all([createUser(db.pool), createUser(db.pool, "Pal"), createUser(db.pool)]);
    await connect(db.pool, viewer, friend);
    await connect(db.pool, privateFriend, viewer);
    await rsvpAs(db, friend, eventId);
    await rsvpAs(db, privateFriend, eventId, false);

    const admin = fakeSupabase(db.pool) as unknown as SupabaseClient;
    const [card] = await buildEventCards(admin, viewer, [(await getVisibleEvent(admin, eventId))!]);

    expect(card!.friendsGoing).toEqual([{ userId: friend, displayName: "Pal", avatarUrl: null }]);
    expect(card!.confirmedCount).toBe(2);
  });
});
