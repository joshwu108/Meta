import { FeedbackRequestSchema } from "@/features/agent/schemas";
import { recordFeedback } from "@/features/agent/server/feedback";
import { ok, parseBody, withAuth } from "@/lib/api";

export const POST = withAuth(async ({ user, supabase }, req) => {
  const body = await parseBody(FeedbackRequestSchema, req);
  const notes = await recordFeedback(supabase, user.id, body);
  return ok({ count: notes.length });
});
