import { ConsentPatchSchema } from "@/features/agent/schemas";
import { getPermissions, patchPermissions } from "@/features/agent/server/preferences";
import { clearMatchCache } from "@/features/matching";
import { clearGraphCache } from "@/features/graph/server/snapshot";
import { ok, parseBody, withAuth } from "@/lib/api";

/** The flags that decide whether this member's preferences reach anyone else's agent. */
const SHARING_FLAGS = ["allow_matching", "allow_demand_aggregation", "allow_group_planning"] as const;

export const GET = withAuth(async ({ user, supabase }) => ok(await getPermissions(supabase, user.id)));

export const PATCH = withAuth(async ({ user, supabase }, req) => {
  const patch = await parseBody(ConsentPatchSchema, req);
  const result = await patchPermissions(supabase, user.id, patch);
  // Match lists and graph snapshots are cached per viewer, so a member who withdraws consent
  // would otherwise stay on other people's screens until those entries expired.
  if (SHARING_FLAGS.some((flag) => flag in patch)) {
    clearMatchCache();
    clearGraphCache();
  }
  return ok(result);
});
