import { eventRoute } from "@/features/events/server/http";
import { reconfirmRsvp } from "@/features/events/server/rsvp";
import { ok } from "@/features/events/server/stubs";

export const POST = eventRoute(async ({ supabase }, eventId) => {
  await reconfirmRsvp(supabase, eventId);
  return ok({ reconfirmed: true });
});
