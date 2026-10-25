import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { FollowUpSuggestion } from "../schemas";
import { haversineKm, type LatLng } from "./geo";
import { venueOf } from "./mappers";
import { getEventsByIds, getVisibleEvent, profilePreviews, type ProfilePreview } from "./repo";
import { ApiError, createAdminClient, getSharablePreferences, notify, suggestFollowUp } from "./stubs";

export const FOLLOW_UP_STATUS = ["suggested", "accepted_a", "accepted_b", "accepted_both", "dismissed"] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUS)[number];
export type FollowUpAction = "accept" | "dismiss";

/** Status after one party acts, or null when the action is not allowed from `current`. */
export function nextFollowUpStatus(current: FollowUpStatus, side: "a" | "b", action: FollowUpAction): FollowUpStatus | null {
  if (current === "dismissed") return null;
  if (action === "dismiss") return current === "accepted_both" ? null : "dismissed";
  if (current === "suggested") return side === "a" ? "accepted_a" : "accepted_b";
  if (current === "accepted_a") return side === "b" ? "accepted_both" : current;
  if (current === "accepted_b") return side === "a" ? "accepted_both" : current;
  return current;
}

/** Follow-up suggestions are shown in My Activity. */
const ACTIVITY_HREF = "/activity";

const canonicalPair = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);

/** Used when either person has not consented to sharing preferences: no AI, no personal data. */
function defaultFollowUp(eventTitle: string): FollowUpSuggestion {
  return {
    title: "Coffee, Saturday morning",
    description: `You both enjoyed ${eventTitle}. Pick up the conversation over coffee.`,
    suggestedSlot: "sat_day",
    suggestedBusinessCategory: "food_drink",
  };
}

async function nearestBusinessId(admin: SupabaseClient, category: string, near: LatLng): Promise<string | undefined> {
  const { data } = await admin.from("businesses").select("id, lat, lng").eq("category", category).eq("is_active", true);
  return (data ?? [])
    .map((b) => ({ id: b.id as string, km: haversineKm(near, { lat: Number(b.lat), lng: Number(b.lng) }) }))
    .sort((p, q) => p.km - q.km)[0]?.id;
}

/** Creates the pair's single suggestion for an event (idempotent) and notifies both people once. */
export async function createFollowUp(eventId: string, userX: string, userY: string): Promise<string> {
  const admin = createAdminClient();
  const [userA, userB] = canonicalPair(userX, userY);
  const existing = await admin.from("follow_up_suggestions").select("id")
    .eq("event_id", eventId).eq("user_a", userA).eq("user_b", userB).maybeSingle();
  if (existing.data) return existing.data.id as string;

  const event = await getVisibleEvent(admin, eventId);
  if (!event) throw new ApiError("NOT_FOUND", "Event not found");
  const [a, b] = await Promise.all([getSharablePreferences(userA, "matching"), getSharablePreferences(userB, "matching")]);
  // 02's agent needs both people's consented preferences; without them, a non-AI default.
  const raw = FollowUpSuggestion.parse(a && b
    ? await suggestFollowUp({ a, b, event: { title: event.title, category: event.category, startsAt: event.starts_at } })
    : defaultFollowUp(event.title));
  const businessId = await nearestBusinessId(admin, raw.suggestedBusinessCategory, venueOf(event));
  const suggestion = { ...raw, ...(businessId ? { businessId } : {}) };

  const { data, error } = await admin.from("follow_up_suggestions")
    .upsert({ event_id: eventId, user_a: userA, user_b: userB, suggestion }, { onConflict: "event_id,user_a,user_b", ignoreDuplicates: true })
    .select("id");
  if (error) throw new ApiError("INTERNAL", "Could not save the follow-up suggestion");
  const created = data?.[0]?.id as string | undefined;
  if (!created) return createFollowUp(eventId, userA, userB);

  await Promise.all([userA, userB].map((userId) => notify(userId, "reconnect_suggestion", { eventId, suggestionId: created, href: ACTIVITY_HREF })));
  return created;
}

export type FollowUpView = {
  id: string;
  eventId: string;
  eventTitle: string;
  otherUser: ProfilePreview | null;
  suggestion: FollowUpSuggestion;
  businessName: string | null;
  status: FollowUpStatus;
  iAccepted: boolean;
  theyAccepted: boolean;
};

const accepted = (status: FollowUpStatus, side: "a" | "b") => status === "accepted_both" || status === `accepted_${side}`;

/** Live (not dismissed) suggestions where the user is either party, newest first. */
export async function listFollowUps(userId: string): Promise<FollowUpView[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("follow_up_suggestions").select("id, event_id, user_a, user_b, suggestion, status")
    .or(`user_a.eq.${z.string().uuid().parse(userId)},user_b.eq.${userId}`).neq("status", "dismissed").order("created_at", { ascending: false });
  if (error) throw new ApiError("INTERNAL", "Could not load follow-ups");
  const rows = data ?? [];
  const others = rows.map((r) => (r.user_a === userId ? r.user_b : r.user_a) as string);
  const suggestions = rows.map((r) => FollowUpSuggestion.parse(r.suggestion));
  const businessIds = suggestions.flatMap((s) => (s.businessId ? [s.businessId] : []));
  const [events, people, businesses] = await Promise.all([
    getEventsByIds(admin, rows.map((r) => r.event_id as string)),
    profilePreviews(admin, others),
    businessIds.length ? admin.from("businesses").select("id, name").in("id", businessIds) : Promise.resolve({ data: [] }),
  ]);
  const titles = new Map(events.map((e) => [e.id, e.title]));
  const names = new Map((businesses.data ?? []).map((b) => [b.id as string, b.name as string]));
  return rows.map((r, i) => {
    const side = r.user_a === userId ? "a" : "b";
    const status = r.status as FollowUpStatus;
    const suggestion = suggestions[i]!;
    return {
      id: r.id as string, eventId: r.event_id as string, eventTitle: titles.get(r.event_id as string) ?? "",
      otherUser: people.get(others[i]!) ?? null, suggestion,
      businessName: suggestion.businessId ? names.get(suggestion.businessId) ?? null : null,
      status, iAccepted: accepted(status, side), theyAccepted: accepted(status, side === "a" ? "b" : "a"),
    };
  });
}

/** PATCH /follow-ups/:id. Optimistic: the update only applies if nobody changed the row meanwhile. */
export async function respondToFollowUp(userId: string, id: string, action: FollowUpAction): Promise<{ status: FollowUpStatus }> {
  const admin = createAdminClient();
  const { data: row } = await admin.from("follow_up_suggestions").select("id, user_a, user_b, status").eq("id", id).maybeSingle();
  if (!row || (row.user_a !== userId && row.user_b !== userId)) throw new ApiError("NOT_FOUND", "Suggestion not found");
  const side = row.user_a === userId ? "a" : "b";
  const next = nextFollowUpStatus(row.status as FollowUpStatus, side, action);
  if (next === null) throw new ApiError("CONFLICT", "This suggestion can no longer be changed");
  if (next === row.status) return { status: next };

  const { data, error } = await admin.from("follow_up_suggestions").update({ status: next })
    .eq("id", id).eq("status", row.status).select("id");
  if (error) throw new ApiError("INTERNAL", "Could not update the suggestion");
  if (!data?.length) throw new ApiError("CONFLICT", "The other person just responded; refresh and try again");
  if (next === "accepted_both") {
    await notify((side === "a" ? row.user_b : row.user_a) as string, "reconnect_suggestion", { suggestionId: id, accepted: true, href: ACTIVITY_HREF });
  }
  return { status: next };
}
