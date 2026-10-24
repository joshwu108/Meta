import { ConfirmRequestSchema } from "@/features/agent/schemas";
import { confirmOnboarding } from "@/features/agent/server/onboarding";
import { ok, parseBody, withAuth } from "@/features/agent/server/stubs";

export const POST = withAuth(async ({ user, supabase }, req) => {
  const body = await parseBody(ConfirmRequestSchema, req);
  await confirmOnboarding(supabase, user.id, body);
  return ok({ ok: true });
});
