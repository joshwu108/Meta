import { randomUUID } from "node:crypto";
import type pg from "pg";

type Queryable = Pick<pg.Pool, "query">;

export async function createUser(db: Queryable, displayName = "Test User", email?: string): Promise<string> {
  const id = randomUUID();
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, email ?? `${id}@weave.test`]);
  await db.query("insert into profiles (id, display_name, is_discoverable) values ($1, $2, true)", [id, displayName]);
  return id;
}

export async function createBusiness(db: Queryable, name = "Kiln & Cup", category = "creative"): Promise<string> {
  const owner = randomUUID();
  await db.query("insert into auth.users (id, email) values ($1, $2)", [owner, `owner.${owner}@weave.test`]);
  const { rows } = await db.query<{ id: string }>(
    `insert into businesses (owner_id, name, slug, category, address, neighborhood, lat, lng)
     values ($1, $3, $2, $4, '1 Valencia St', 'Mission', 37.76, -122.42) returning id`,
    [owner, `biz-${owner.slice(0, 8)}`, name, category],
  );
  return rows[0]!.id;
}

export type EventInput = {
  businessId: string;
  capacity?: number;
  status?: string;
  startsInHours?: number;
  title?: string;
};

export async function createEvent(db: Queryable, input: EventInput): Promise<string> {
  const startsInHours = input.startsInHours ?? 48;
  const { rows } = await db.query<{ id: string }>(
    `insert into events (business_id, source, title, description, category, format, starts_at, ends_at, capacity, price_cents, status, cancel_reason)
     values ($1, 'business_manual', $2, 'A test event', 'creative', 'workshop',
             now() + make_interval(hours => $3), now() + make_interval(hours => $3 + 2), $4, 2500, $5,
             case when $5 = 'cancelled' then 'Venue closed' end)
     returning id`,
    [input.businessId, input.title ?? "Beginner Pottery Night", startsInHours, input.capacity ?? 10, input.status ?? "published"],
  );
  return rows[0]!.id;
}

export async function confirmedCount(db: Queryable, eventId: string): Promise<number> {
  const { rows } = await db.query<{ n: string }>(
    "select count(*) as n from rsvps where event_id = $1 and status = 'confirmed'",
    [eventId],
  );
  return Number(rows[0]!.n);
}

export async function eventStatus(db: Queryable, eventId: string): Promise<string> {
  const { rows } = await db.query<{ status: string }>("select status from events where id = $1", [eventId]);
  return rows[0]!.status;
}

export async function setLocation(db: Queryable, userId: string, lat: number, lng: number): Promise<void> {
  await db.query("update profiles set coarse_lat = $2, coarse_lng = $3, neighborhood = 'Mission' where id = $1", [userId, lat, lng]);
}

export type Consent = Partial<Record<
  "allow_matching" | "allow_demand_aggregation" | "allow_group_planning" | "share_interests_with_attendees" | "share_name_with_business",
  boolean
>>;

export async function setConsent(db: Queryable, userId: string, consent: Consent): Promise<void> {
  await db.query(
    `insert into agent_profiles (user_id, consent) values ($1, $2)
     on conflict (user_id) do update set consent = agent_profiles.consent || excluded.consent`,
    [userId, consent],
  );
}

export async function setPreferences(db: Queryable, userId: string, prefs: {
  interests: string[]; categories: string[]; slots: string[]; groupSize?: string; budgetMax?: number | null; radiusKm?: number;
}): Promise<void> {
  await db.query(
    `insert into user_preferences (user_id, interests, interest_categories, availability_slots, group_size_pref, budget_max_cents, travel_radius_km)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, prefs.interests, prefs.categories, prefs.slots, prefs.groupSize ?? "small", prefs.budgetMax ?? null, prefs.radiusKm ?? 5],
  );
}

export async function connect(db: Queryable, a: string, b: string): Promise<void> {
  await db.query("insert into connections (requester_id, recipient_id, status) values ($1, $2, 'accepted')", [a, b]);
}

export async function block(db: Queryable, blocker: string, blocked: string): Promise<void> {
  await db.query("insert into blocks (blocker_id, blocked_id) values ($1, $2)", [blocker, blocked]);
}

export async function createGroup(db: Queryable, creator: string, members: Array<[string, string]>): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into groups (name, creator_id) values ('Mission Makers', $1) returning id",
    [creator],
  );
  const groupId = rows[0]!.id;
  for (const [userId, status] of members) {
    await db.query("insert into group_members (group_id, user_id, status) values ($1, $2, $3)", [groupId, userId, status]);
  }
  return groupId;
}

export async function rsvpAs(db: { asUser: <T>(u: string, fn: (c: pg.PoolClient) => Promise<T>) => Promise<T> }, userId: string, eventId: string, share = true) {
  await db.asUser(userId, (c) => c.query("select * from rsvp_event($1, $2, false)", [eventId, share]));
}

/** Test-only status change that passes 05's guard the way its status RPCs do. */
export async function setEventStatus(db: Pick<pg.Pool, "connect">, eventId: string, status: string): Promise<void> {
  const client = await db.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('commonground.status_rpc', 'on', true)");
    await client.query("update events set status = $2 where id = $1", [eventId, status]);
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
