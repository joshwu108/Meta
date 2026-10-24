import { randomUUID } from "node:crypto";
import type pg from "pg";

type Queryable = Pick<pg.Pool, "query">;

export async function createUser(db: Queryable, displayName = "Test User"): Promise<string> {
  const id = randomUUID();
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${id}@commonground.test`]);
  await db.query("insert into profiles (id, display_name, is_discoverable) values ($1, $2, true)", [id, displayName]);
  return id;
}

export async function createBusiness(db: Queryable): Promise<string> {
  const owner = randomUUID();
  await db.query("insert into auth.users (id, email) values ($1, $2)", [owner, `owner.${owner}@commonground.test`]);
  const { rows } = await db.query<{ id: string }>(
    `insert into businesses (owner_id, name, slug, category, address, neighborhood, lat, lng)
     values ($1, 'Kiln & Cup', $2, 'creative', '1 Valencia St', 'Mission', 37.76, -122.42) returning id`,
    [owner, `kiln-${owner.slice(0, 8)}`],
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
    `insert into events (business_id, source, title, description, category, format, starts_at, ends_at, capacity, price_cents, status)
     values ($1, 'business_manual', $2, 'A test event', 'creative', 'workshop',
             now() + make_interval(hours => $3), now() + make_interval(hours => $3 + 2), $4, 2500, $5)
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
