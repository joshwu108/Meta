import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { EventCategory, RsvpStatus } from "@/shared/enums";
import { EVENT_SELECT, EventRow } from "../schemas";
import { compareInstants } from "./time";

/** Statuses anyone may browse and RSVP to. */
export const LIVE_STATUSES = ["published", "full"] as const;
/** Statuses an event page can show (drafts never leave 05). */
export const VISIBLE_STATUSES = ["published", "full", "completed", "cancelled"] as const;

const rowsOf = (data: unknown) => z.array(EventRow).parse(data ?? []);

function must<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export type EventFilters = { category?: EventCategory; from?: string; to?: string; page: number; limit: number };

export async function listLiveEvents(db: SupabaseClient, f: EventFilters): Promise<{ rows: EventRow[]; total: number }> {
  let query = db
    .from("events")
    .select(EVENT_SELECT, { count: "exact" })
    .in("status", LIVE_STATUSES)
    .gte("starts_at", f.from ?? new Date().toISOString())
    .order("starts_at")
    .order("id")
    .range((f.page - 1) * f.limit, f.page * f.limit - 1);
  if (f.category) query = query.eq("category", f.category);
  if (f.to) query = query.lte("starts_at", f.to);
  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  return { rows: rowsOf(data), total: count ?? 0 };
}

export async function listLiveEventsBetween(db: SupabaseClient, from: Date, to: Date): Promise<EventRow[]> {
  const data = must(
    await db.from("events").select(EVENT_SELECT).in("status", LIVE_STATUSES)
      .gte("starts_at", from.toISOString()).lte("starts_at", to.toISOString()).order("starts_at").limit(200),
  );
  return rowsOf(data);
}

export async function getVisibleEvent(db: SupabaseClient, eventId: string): Promise<EventRow | null> {
  const data = must(
    await db.from("events").select(EVENT_SELECT).eq("id", eventId).in("status", VISIBLE_STATUSES).maybeSingle(),
  );
  return data ? EventRow.parse(data) : null;
}

export async function getEventsByIds(db: SupabaseClient, ids: readonly string[]): Promise<EventRow[]> {
  if (ids.length === 0) return [];
  return rowsOf(must(await db.from("events").select(EVENT_SELECT).in("id", ids).in("status", VISIBLE_STATUSES)));
}

export async function confirmedCounts(db: SupabaseClient, eventIds: readonly string[]): Promise<Map<string, number>> {
  if (eventIds.length === 0) return new Map();
  const data = must(await db.from("rsvps").select("event_id").eq("status", "confirmed").in("event_id", eventIds));
  const counts = new Map<string, number>(eventIds.map((id) => [id, 0]));
  for (const r of data ?? []) counts.set(r.event_id as string, (counts.get(r.event_id as string) ?? 0) + 1);
  return counts;
}

export type MyRsvp = {
  eventId: string;
  status: RsvpStatus;
  needsReconfirm: boolean;
  shareWithAttendees: boolean;
  shareWithBusiness: boolean;
};

const MyRsvpRow = z.object({
  event_id: z.string(),
  status: z.enum(["confirmed", "cancelled", "waitlisted"]),
  needs_reconfirm: z.boolean(),
  share_with_attendees: z.boolean(),
  share_with_business: z.boolean(),
});

export async function myRsvps(db: SupabaseClient, userId: string, eventIds?: readonly string[]): Promise<Map<string, MyRsvp>> {
  let query = db.from("rsvps")
    .select("event_id, status, needs_reconfirm, share_with_attendees, share_with_business").eq("user_id", userId);
  if (eventIds) {
    if (eventIds.length === 0) return new Map();
    query = query.in("event_id", eventIds);
  }
  const rows = z.array(MyRsvpRow).parse(must(await query) ?? []);
  return new Map(rows.map((r) => [r.event_id, {
    eventId: r.event_id, status: r.status, needsReconfirm: r.needs_reconfirm,
    shareWithAttendees: r.share_with_attendees, shareWithBusiness: r.share_with_business,
  }]));
}

/** Per event, the friends with a confirmed RSVP who chose to share with attendees. */
export async function friendsGoing(
  db: SupabaseClient, eventIds: readonly string[], friendIds: ReadonlySet<string>,
): Promise<Map<string, string[]>> {
  if (eventIds.length === 0 || friendIds.size === 0) return new Map();
  const data = must(
    await db.from("rsvps").select("event_id, user_id").eq("status", "confirmed").eq("share_with_attendees", true)
      .in("event_id", eventIds).in("user_id", [...friendIds]),
  );
  const going = new Map<string, string[]>();
  for (const r of data ?? []) going.set(r.event_id as string, [...(going.get(r.event_id as string) ?? []), r.user_id as string]);
  return going;
}

export type ConfirmedAttendee = {
  userId: string;
  shareWithAttendees: boolean;
  displayName: string | null;
  avatarUrl: string | null;
};

/** Confirmed attendees; profile fields are fetched only for rows that consented to share. */
export async function confirmedAttendees(db: SupabaseClient, eventId: string): Promise<ConfirmedAttendee[]> {
  const rsvps = must(
    await db.from("rsvps").select("user_id, share_with_attendees").eq("event_id", eventId).eq("status", "confirmed")
      .order("created_at"),
  ) ?? [];
  const sharing = rsvps.filter((r) => r.share_with_attendees).map((r) => r.user_id as string);
  const profiles = sharing.length === 0 ? [] : must(
    await db.from("profiles").select("id, display_name, avatar_url").in("id", sharing),
  ) ?? [];
  const byId = new Map(profiles.map((p) => [p.id as string, p]));
  return rsvps.map((r) => {
    const profile = r.share_with_attendees ? byId.get(r.user_id as string) : undefined;
    return {
      userId: r.user_id as string,
      shareWithAttendees: r.share_with_attendees as boolean,
      displayName: (profile?.display_name ?? null) as string | null,
      avatarUrl: (profile?.avatar_url ?? null) as string | null,
    };
  });
}

/** Active (confirmed or waitlisted) RSVP holders among the given users. */
export async function activeRsvpUserIds(db: SupabaseClient, eventId: string, userIds: readonly string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const data = must(
    await db.from("rsvps").select("user_id").eq("event_id", eventId).in("status", ["confirmed", "waitlisted"])
      .in("user_id", userIds),
  );
  return new Set((data ?? []).map((r) => r.user_id as string));
}

/** A user's confirmed/waitlisted events with the RSVP state, any event status. */
export async function eventsForUser(db: SupabaseClient, userId: string): Promise<Array<{ row: EventRow; rsvp: MyRsvp }>> {
  const rsvps = await myRsvps(db, userId);
  const active = [...rsvps.values()].filter((r) => r.status !== "cancelled");
  const rows = await getEventsByIds(db, active.map((r) => r.eventId));
  return rows
    .map((row) => ({ row, rsvp: rsvps.get(row.id)! }))
    .sort((a, b) => compareInstants(a.row.starts_at, b.row.starts_at));
}

export type ProfilePreview = { userId: string; displayName: string; avatarUrl: string | null };

/** Name + avatar for users whose identity the caller has already cleared for display. */
export async function profilePreviews(db: SupabaseClient, userIds: readonly string[]): Promise<Map<string, ProfilePreview>> {
  if (userIds.length === 0) return new Map();
  const data = must(await db.from("profiles").select("id, display_name, avatar_url").in("id", userIds)) ?? [];
  return new Map(data.map((p) => [p.id as string, {
    userId: p.id as string, displayName: p.display_name as string, avatarUrl: (p.avatar_url ?? null) as string | null,
  }]));
}

export type ViewerProfile = { lat: number | null; lng: number | null };

export async function viewerLocation(db: SupabaseClient, userId: string): Promise<ViewerProfile> {
  const data = must(await db.from("profiles").select("coarse_lat, coarse_lng").eq("id", userId).maybeSingle());
  return {
    lat: data?.coarse_lat == null ? null : Number(data.coarse_lat),
    lng: data?.coarse_lng == null ? null : Number(data.coarse_lng),
  };
}

export async function hasFeedback(db: SupabaseClient, userId: string, eventId: string): Promise<boolean> {
  const data = must(await db.from("event_feedback").select("event_id").eq("user_id", userId).eq("event_id", eventId).maybeSingle());
  return data !== null;
}
