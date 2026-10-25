import { ReconnectBody } from "@/features/events/schemas";
import { eventRoute } from "@/features/events/server/http";
import { expressReconnectInterest } from "@/features/events/server/post-event";
import { ok, parseBody } from "@/features/events/server/stubs";

export const POST = eventRoute(async ({ user, supabase }, eventId, req) => {
  const { toUserId } = await parseBody(ReconnectBody, req);
  return ok(await expressReconnectInterest(supabase, user.id, eventId, toUserId));
});
