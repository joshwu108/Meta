import { OnboardBasicsSchema } from "@/features/agent/schemas";
import { saveBasics } from "@/features/agent/server/onboarding";
import { ok, parseBody, withAuth } from "@/features/agent/server/stubs";

export const POST = withAuth(async ({ user, supabase }, req) => {
  const basics = await parseBody(OnboardBasicsSchema, req);
  await saveBasics(supabase, user.id, basics);
  return ok({ ok: true });
});
