import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { AVAILABILITY_SLOT, type AvailabilitySlot, type EventCategory, type EventStatus, type RsvpStatus } from '@/shared/enums';
import type { BusinessPublicCard, EventPublic, EventSummary, SharablePreferences } from '@/shared/types';

/**
 * Stand-ins for workstream 06's `getUpcomingEventsForUser` and `getEventPublic` (README §4), with
 * 06's semantics: live events in the next 21 days plus the user's own upcoming RSVPs, soonest
 * first. They read 05/06 tables directly and return nothing while those tables are not migrated.
 * Delete this file and import from `@/features/events` once 06 is on main.
 */

// 02's consent boundary stand-in is shared by both 03 features until 02 lands on main.
export { getSharablePreferencesBatch } from '@/features/matching/server/stubs';

const UPCOMING_DAYS = 21;

type EventRow = {
  id: string;
  title: string;
  description: string;
  category: string;
  format: string | null;
  starts_at: string;
  ends_at: string;
  capacity: number;
  price_cents: number | null;
  status: string;
  source: string;
  business_id: string;
};
type BusinessRow = { id: string; name: string; category: string; neighborhood: string | null; address: string; description: string | null; image_url: string | null };

const db = () => createAdminClient() as unknown as SupabaseClient;
const EVENT_COLUMNS = 'id, title, description, category, format, starts_at, ends_at, capacity, price_cents, status, source, business_id';

async function businessCards(ids: readonly string[]): Promise<Map<string, BusinessPublicCard>> {
  if (ids.length === 0) return new Map();
  const { data } = await db().from('businesses').select('id, name, category, neighborhood, address, description, image_url').in('id', [...new Set(ids)]);
  return new Map(
    ((data ?? []) as BusinessRow[]).map((b) => [
      b.id,
      { id: b.id, name: b.name, category: b.category as EventCategory, neighborhood: b.neighborhood ?? '', address: b.address, description: b.description ?? '', imageUrl: b.image_url },
    ]),
  );
}

const unknownBusiness = (id: string): BusinessPublicCard => ({ id, name: 'Local venue', category: 'community', neighborhood: '', address: '', description: '', imageUrl: null });

function toSummary(row: EventRow, business: BusinessPublicCard, rsvpStatus: RsvpStatus | null): EventSummary {
  return { id: row.id, title: row.title, startsAt: row.starts_at, status: row.status as EventStatus, business, rsvpStatus };
}

export async function getUpcomingEventsForUser(userId: string): Promise<EventSummary[]> {
  const now = new Date();
  const until = new Date(now.getTime() + UPCOMING_DAYS * 86_400_000);
  const { data, error } = await db()
    .from('events')
    .select(EVENT_COLUMNS)
    .in('status', ['published', 'full'])
    .gte('starts_at', now.toISOString())
    .lte('starts_at', until.toISOString())
    .order('starts_at');
  if (error || !data) return [];
  const rows = data as EventRow[];
  const { data: rsvps } = await db().from('rsvps').select('event_id, status').eq('user_id', userId).in('event_id', rows.map((r) => r.id));
  const statusOf = new Map(((rsvps ?? []) as Array<{ event_id: string; status: RsvpStatus }>).map((r) => [r.event_id, r.status]));
  const businesses = await businessCards(rows.map((r) => r.business_id));
  return rows.map((row) => toSummary(row, businesses.get(row.business_id) ?? unknownBusiness(row.business_id), statusOf.get(row.id) ?? null));
}

export async function getEventPublic(eventId: string): Promise<EventPublic | null> {
  const { data, error } = await db().from('events').select(EVENT_COLUMNS).eq('id', eventId).in('status', ['published', 'full', 'completed', 'cancelled']).maybeSingle();
  if (error || !data) return null;
  const row = data as EventRow;
  const business = (await businessCards([row.business_id])).get(row.business_id) ?? unknownBusiness(row.business_id);
  return {
    ...toSummary(row, business, null),
    description: row.description,
    category: row.category as EventCategory,
    endsAt: row.ends_at,
    capacity: row.capacity,
    confirmedCount: 0,
    priceCents: row.price_cents,
    format: row.format ?? '',
    source: row.source as EventPublic['source'],
  };
}

// ---------------------------------------------------------------------------
// 02's P1 `resolveGroupSchedule` (specs/02 §3 P1), same signature and semantics as on
// ws/02-agent. Pure; delete and import from `@/features/agent` once 02 is on main.
// ---------------------------------------------------------------------------

export type SlotOption = { slot: AvailabilitySlot; available: string[]; missing: string[] };
export type GroupSchedule = { options: SlotOption[]; unanimous: AvailabilitySlot | null; budgetMaxCents: number | null };

export function resolveGroupSchedule(members: readonly SharablePreferences[], maxOptions = 3): GroupSchedule {
  if (members.length === 0) return { options: [], unanimous: null, budgetMaxCents: null };
  const options = AVAILABILITY_SLOT.map((slot) => {
    const available = members.filter((m) => m.availabilitySlots.includes(slot)).map((m) => m.userId);
    return { slot, available, missing: members.map((m) => m.userId).filter((id) => !available.includes(id)) };
  })
    .filter((o) => o.available.length > 0)
    .sort((a, b) => b.available.length - a.available.length || AVAILABILITY_SLOT.indexOf(a.slot) - AVAILABILITY_SLOT.indexOf(b.slot))
    .slice(0, maxOptions);
  const unanimous = options.find((o) => o.missing.length === 0)?.slot ?? null;
  const budgets = members.map((m) => m.budgetMax).filter((b): b is number => b !== null && b !== undefined);
  return { options, unanimous, budgetMaxCents: budgets.length ? Math.min(...budgets) : null };
}
