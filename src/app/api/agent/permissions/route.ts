import { ConsentPatchSchema } from "@/features/agent/schemas";
import { getPermissions, patchPermissions } from "@/features/agent/server/preferences";
import { ok, parseBody, withAuth } from "@/lib/api";

export const GET = withAuth(async ({ user, supabase }) => ok(await getPermissions(supabase, user.id)));

export const PATCH = withAuth(async ({ user, supabase }, req) => {
  const patch = await parseBody(ConsentPatchSchema, req);
  return ok(await patchPermissions(supabase, user.id, patch));
});
