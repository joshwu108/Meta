import type { SupabaseClient } from "@supabase/supabase-js";
import fixture from "./fixtures/events-06.json";

// Workstream 06 seed contribution (spec §8). Called by 01's seed runner after users, businesses
// and events are loaded, with the runner's email → user id map. Idempotent: re-running adds nothing.

export type SeedSummary = { rsvps: number; fullEventId: string | null; completedEventId: string | null };

type SeedEvent = { id: string; capacity: number; starts_at: string; status?: string };

function must<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

/** Seedable consumers in a stable order: demo accounts and business owners never get seeded RSVPs. */
export function rsvpCandidates(usersByEmail: Record<string, string>): string[] {
  return Object.keys(usersByEmail)
    .filter((email) => !fixture.excludeFromRsvps.includes(email))
    .filter((email) => !fixture.excludePrefixes.some((p) => email.startsWith(p)))
    .sort()
    .map((email) => usersByEmail[email]!);
}

/** Deterministic attendee picks: event i gets min + (2i mod span) people, rotating through candidates. */
export function planRsvps(events: readonly SeedEvent[], candidates: readonly string[]) {
  const { min, max } = fixture.rsvpsPerEvent;
  const span = max - min + 1;
  const ordered = [...events].sort((a, b) => a.capacity - b.capacity || a.id.localeCompare(b.id));
  const fullId = ordered[0]?.id ?? null;
  return ordered.map((event, i) => {
    const wanted = event.id === fullId ? event.capacity : min + ((2 * i) % span);
    const count = Math.min(wanted, event.capacity, candidates.length);
    const userIds = Array.from({ length: count }, (_, k) => candidates[(i * 3 + k) % candidates.length]!);
    return { eventId: event.id, full: event.id === fullId && count === event.capacity, userIds };
  });
}

function localEvening(daysAgo: number, hour: number, now: Date): Date {
  // America/Los_Angeles is UTC-7 or UTC-8; anchoring at UTC+8h keeps the hour within the evening slot.
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo));
  return new Date(day.getTime() + (hour + 8) * 3_600_000);
}

async function seedCompletedEvent(admin: SupabaseClient, usersByEmail: Record<string, string>, now: Date): Promise<string | null> {
  const spec = fixture.completedEvent;
  const venue = must(await admin.from("businesses").select("id").eq("name", spec.venue).maybeSingle());
  if (!venue) return null;
  const existing = must(await admin.from("events").select("id").eq("business_id", venue.id).eq("title", spec.title).maybeSingle());
  const startsAt = localEvening(spec.daysAgo, spec.startHourLocal, now);
  const eventId = (existing?.id as string | undefined) ?? (must(await admin.from("events").insert({
    business_id: venue.id, source: "business_manual", title: spec.title, description: spec.description,
    category: spec.category, format: spec.format, starts_at: startsAt.toISOString(),
    ends_at: new Date(startsAt.getTime() + spec.durationHours * 3_600_000).toISOString(),
    capacity: spec.capacity, price_cents: spec.priceCents, status: "completed", published_at: startsAt.toISOString(),
  }).select("id")) as Array<{ id: string }>)[0]!.id;

  const attendees = spec.attendees.map((e) => usersByEmail[e]).filter((id): id is string => Boolean(id));
  must(await admin.from("rsvps").upsert(
    attendees.map((user_id) => ({ event_id: eventId, user_id, status: "confirmed", share_with_attendees: true })),
    { onConflict: "event_id,user_id", ignoreDuplicates: true },
  ).select("event_id"));
  const from = usersByEmail[spec.reconnect.from];
  const to = usersByEmail[spec.reconnect.to];
  if (from && to) {
    must(await admin.from("reconnect_interest").upsert(
      { event_id: eventId, from_user_id: from, to_user_id: to }, { ignoreDuplicates: true },
    ).select("event_id"));
  }
  return eventId;
}

export async function seedEventsAndRsvps(
  admin: SupabaseClient, usersByEmail: Record<string, string>, now = new Date(),
): Promise<SeedSummary> {
  // Include `full` so a re-run sees the same events and plans the same (already inserted) RSVPs.
  const events = must(await admin.from("events").select("id, capacity, starts_at, status").in("status", ["published", "full"])
    .gte("starts_at", now.toISOString())) as SeedEvent[];
  const plan = planRsvps(events, rsvpCandidates(usersByEmail));
  const rows = plan.flatMap((p) => p.userIds.map((user_id, k) => ({
    event_id: p.eventId, user_id, status: "confirmed", share_with_attendees: k % 2 === 0, share_with_business: k % 3 === 0,
  })));
  const inserted = rows.length === 0 ? [] : must(await admin.from("rsvps")
    .upsert(rows, { onConflict: "event_id,user_id", ignoreDuplicates: true }).select("event_id")) as unknown[];
  const full = plan.find((p) => p.full);
  const fullStatus = full ? events.find((e) => e.id === full.eventId)?.status : undefined;
  if (full && fullStatus === "published") {
    // 05's guard only accepts status changes through its transition function.
    must(await admin.rpc("transition_event_status", { p_event_id: full.eventId, p_to: "full" }));
  }

  const completedEventId = await seedCompletedEvent(admin, usersByEmail, now);
  return { rsvps: inserted.length, fullEventId: full?.eventId ?? null, completedEventId };
}
