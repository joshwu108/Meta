import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildEventCards, type EventCard } from "./cards";
import { getEventsByIds, getVisibleEvent } from "./repo";
import { ApiError, createAdminClient } from "./stubs";
import { millis } from "./time";

/** Save or unsave an event (P1). Writes through the user's RLS-bound client; idempotent both ways. */
export async function setEventBookmark(supabase: SupabaseClient, userId: string, eventId: string, saved: boolean): Promise<{ saved: boolean }> {
  if (!(await getVisibleEvent(createAdminClient(), eventId))) throw new ApiError("NOT_FOUND", "Event not found");
  const key = { user_id: userId, target_type: "event", target_id: eventId };
  const { error } = saved
    ? await supabase.from("bookmarks").upsert(key, { ignoreDuplicates: true }).select("target_id")
    : await supabase.from("bookmarks").delete().eq("user_id", userId).eq("target_type", "event").eq("target_id", eventId).select("target_id");
  if (error) throw new ApiError("INTERNAL", "Could not update your saved events");
  return { saved };
}

export async function bookmarkedEventIds(admin: SupabaseClient, userId: string): Promise<Set<string>> {
  const { data, error } = await admin.from("bookmarks").select("target_id").eq("user_id", userId).eq("target_type", "event");
  if (error) throw new ApiError("INTERNAL", "Could not load saved events");
  return new Set((data ?? []).map((b) => b.target_id as string));
}

/** Saved events that have not happened yet, soonest first. */
export async function savedUpcomingEvents(userId: string): Promise<EventCard[]> {
  const admin = createAdminClient();
  const ids = await bookmarkedEventIds(admin, userId);
  const now = Date.now();
  const rows = (await getEventsByIds(admin, [...ids]))
    .filter((r) => r.status !== "cancelled" && r.status !== "completed" && millis(r.starts_at) > now)
    .sort((a, b) => millis(a.starts_at) - millis(b.starts_at));
  return buildEventCards(admin, userId, rows);
}
