import { UserPreferencesPatchSchema } from "@/features/agent/schemas";
import { patchPreferences } from "@/features/agent/server/preferences";
import { getPreferences } from "@/features/agent/server/repo";
import { ok, parseBody, withAuth } from "@/lib/api";

export const GET = withAuth(async ({ user, supabase }) => ok(await getPreferences(supabase, user.id)));

export const PATCH = withAuth(async ({ user, supabase }, req) => {
  const patch = await parseBody(UserPreferencesPatchSchema, req);
  return ok(await patchPreferences(supabase, user.id, patch));
});
