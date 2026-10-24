import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { RsvpBody } from "../schemas";
import { fromRpcError } from "./rpc-errors";
import { ApiError, notify } from "./stubs";

const RsvpResult = z.array(z.object({ rsvp_status: z.enum(["confirmed", "waitlisted"]), event_status: z.string() })).length(1);
const CancelResult = z.array(z.object({
  cancelled: z.boolean(), promoted_user_id: z.string().nullable(), event_status: z.string(),
})).length(1);

/** P1 waitlist switch; off in P0, where a full event answers CAPACITY_FULL. */
export const waitlistEnabled = () => process.env.WAITLIST_ENABLED === "1";

export type RsvpOutcome = { status: "confirmed" | "waitlisted"; eventStatus: string };

/**
 * RSVP through the capacity-safe function. The consent sheet prefills from the agent's
 * permissions in the browser; a caller that omits a choice shares nothing.
 */
export async function rsvpToEvent(
  supabase: SupabaseClient, userId: string, eventId: string, body: z.infer<typeof RsvpBody>,
): Promise<RsvpOutcome> {
  const { data, error } = await supabase.rpc("rsvp_event", {
    p_event_id: eventId,
    p_share_attendees: body.shareWithAttendees ?? false,
    p_share_business: body.shareWithBusiness ?? false,
    p_allow_waitlist: waitlistEnabled(),
  });
  if (error) throw fromRpcError(error);
  const [row] = RsvpResult.parse(data);
  if (row!.rsvp_status === "confirmed") await notify(userId, "rsvp_confirmed", { eventId });
  return { status: row!.rsvp_status, eventStatus: row!.event_status };
}

export async function cancelRsvp(supabase: SupabaseClient, eventId: string): Promise<{ eventStatus: string }> {
  const { data, error } = await supabase.rpc("cancel_rsvp", { p_event_id: eventId });
  if (error) throw fromRpcError(error);
  const [row] = CancelResult.parse(data);
  if (!row!.cancelled) throw new ApiError("NOT_FOUND", "You have no RSVP to cancel");
  if (row!.promoted_user_id) {
    await notify(row!.promoted_user_id, "rsvp_confirmed", { eventId, promotedFromWaitlist: true });
  }
  return { eventStatus: row!.event_status };
}

export async function reconfirmRsvp(supabase: SupabaseClient, eventId: string): Promise<void> {
  const { error } = await supabase.rpc("reconfirm_rsvp", { p_event_id: eventId });
  if (error) throw fromRpcError(error);
}
