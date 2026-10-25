import { ok, parseBody, withAuth } from '@/lib/api';
import { getOwnProfile, updateOwnProfile } from '@/features/core/server/profile';
import { invalidateGraph } from '@/features/graph/server/snapshot';
import { profileUpdateSchema } from '@/shared/schemas/profile';

/** GET /api/me — the signed-in user's profile. */
export const GET = withAuth(async ({ user, supabase }) => {
  const profile = await getOwnProfile(supabase, user.id);
  return ok({ id: user.id, email: user.email ?? null, profile });
});

/** PATCH /api/me — update own profile fields. */
export const PATCH = withAuth(async ({ user, supabase }, req) => {
  const patch = await parseBody(profileUpdateSchema, req);
  const profile = await updateOwnProfile(supabase, user.id, patch);
  // The graph draws this profile's name and picture, so a cached snapshot is now stale.
  invalidateGraph(user.id);
  return ok(profile);
});
