import { RsvpBody } from "@/features/events/schemas";
import { eventRoute } from "@/features/events/server/http";
import { cancelRsvp, rsvpToEvent } from "@/features/events/server/rsvp";
import { ok, parseBody } from "@/features/events/server/stubs";

export const POST = eventRoute(async ({ user, supabase }, eventId, req) => {
  const body = await parseBody(RsvpBody, req);
  return ok(await rsvpToEvent(supabase, user.id, eventId, body), undefined, { status: 201 });
});

export const DELETE = eventRoute(async ({ supabase }, eventId) => ok(await cancelRsvp(supabase, eventId)));
