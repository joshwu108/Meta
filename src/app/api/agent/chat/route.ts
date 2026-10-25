import { ChatRequestSchema } from "@/features/agent/schemas";
import { handleChatMessage, loadChatHistory } from "@/features/agent/server/chat";
import { handleOnboardingMessage } from "@/features/agent/server/onboarding";
import { chatLimiter } from "@/features/agent/server/rate-limit";
import { fail, ok, parseBody, withAuth } from "@/lib/api";

export const POST = withAuth(async ({ user, supabase }, req) => {
  if (!chatLimiter.take(user.id)) {
    return fail("RATE_LIMITED", "You're chatting fast. Try again in a few minutes.");
  }
  const body = await parseBody(ChatRequestSchema, req);
  const handle = body.kind === "onboarding" ? handleOnboardingMessage : handleChatMessage;
  return ok(await handle(supabase, user.id, body.message, body.conversationId));
});

/** GET /api/agent/chat: the latest /agent conversation, so the chat survives a reload. */
export const GET = withAuth(async ({ user, supabase }) => ok(await loadChatHistory(supabase, user.id)));
