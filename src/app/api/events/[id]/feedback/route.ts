import { FeedbackBody } from "@/features/events/schemas";
import { eventRoute } from "@/features/events/server/http";
import { submitFeedback } from "@/features/events/server/post-event";
import { ok, parseBody } from "@/features/events/server/stubs";

export const POST = eventRoute(async ({ user, supabase }, eventId, req) => {
  await submitFeedback(supabase, user.id, eventId, await parseBody(FeedbackBody, req));
  return ok({ saved: true }, undefined, { status: 201 });
});
