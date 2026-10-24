import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { FeedbackBody } from "../schemas";
import { createFollowUp } from "./follow-ups";
import { getVisibleEvent, myRsvps } from "./repo";
import { fromRpcError } from "./rpc-errors";
import { ApiError, createAdminClient, getBlockEdges } from "./stubs";
import { isBlockedEitherWay } from "./visibility";

async function requireCompletedAttendance(userId: string, eventId: string) {
  const admin = createAdminClient();
  const event = await getVisibleEvent(admin, eventId);
  if (!event) throw new ApiError("NOT_FOUND", "Event not found");
  if (event.status !== "completed") throw new ApiError("CONFLICT", "Feedback opens once the event is completed");
  const mine = await myRsvps(admin, userId, [eventId]);
  if (mine.get(eventId)?.status !== "confirmed") throw new ApiError("FORBIDDEN", "Only attendees can leave feedback");
  return event;
}

/** POST /events/:id/feedback. One row per attendee; resubmitting replaces it. */
export async function submitFeedback(
  supabase: SupabaseClient, userId: string, eventId: string, body: z.infer<typeof FeedbackBody>,
): Promise<void> {
  await requireCompletedAttendance(userId, eventId);
  const { error } = await supabase.from("event_feedback").upsert({
    event_id: eventId,
    user_id: userId,
    rating: body.rating,
    met_someone: body.metSomeone ?? null,
    comment: body.comment || null,
  });
  if (error) throw new ApiError("INTERNAL", "Could not save feedback");
}

export type ReconnectResult = { mutual: boolean; suggestionId: string | null };

/**
 * POST /events/:id/reconnect. The database checks completion and attendance; on mutual
 * interest the pair gets one AI follow-up suggestion and one notification each.
 */
export async function expressReconnectInterest(
  supabase: SupabaseClient, userId: string, eventId: string, toUserId: string,
): Promise<ReconnectResult> {
  const blocks = await getBlockEdges(userId);
  // Same answer as a non-attendee so a block is never revealed.
  if (isBlockedEitherWay(blocks, userId, toUserId)) throw fromRpcError({ message: "NOT_ATTENDEES" });

  const { data, error } = await supabase.rpc("add_reconnect_interest", { p_event_id: eventId, p_to_user: toUserId });
  if (error) throw fromRpcError(error);
  if (data !== true) return { mutual: false, suggestionId: null };

  const suggestionId = await createFollowUp(eventId, userId, toUserId);
  return { mutual: true, suggestionId };
}

/** Business owner of the venue, or anyone while DEMO_MODE=1 (the demo operator). */
async function canComplete(admin: SupabaseClient, userId: string, businessId: string): Promise<boolean> {
  if (process.env.DEMO_MODE === "1") return true;
  const { data } = await admin.from("businesses").select("owner_id").eq("id", businessId).maybeSingle();
  return data?.owner_id === userId;
}

/** PATCH /events/:id/complete: published/full → completed. */
export async function completeEvent(userId: string, eventId: string): Promise<{ status: "completed" }> {
  const admin = createAdminClient();
  const event = await getVisibleEvent(admin, eventId);
  if (!event) throw new ApiError("NOT_FOUND", "Event not found");
  if (!(await canComplete(admin, userId, event.business_id))) {
    throw new ApiError("FORBIDDEN", "Only the venue can complete this event");
  }
  const { data, error } = await admin.from("events").update({ status: "completed" })
    .eq("id", eventId).in("status", ["published", "full"]).select("id");
  if (error) throw new ApiError("INTERNAL", "Could not complete the event");
  if (!data || data.length === 0) throw new ApiError("CONFLICT", `Event is ${event.status}, not live`);
  return { status: "completed" };
}
