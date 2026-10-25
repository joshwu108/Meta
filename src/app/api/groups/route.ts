import { ok, parseBody, parseQuery, withAuth } from '@/lib/api';
import { createGroup } from '@/features/groups/server/manage';
import { listMyGroups, listPublicGroups } from '@/features/groups/server/summaries';
import { groupCreateSchema, groupListQuerySchema } from '@/shared/schemas/social';

/** GET /api/groups — mine (active + invited); `?discover=1` lists public groups (P1). */
export const GET = withAuth(async ({ user, supabase }, req) => {
  const { discover } = parseQuery(groupListQuerySchema, req.url);
  const actor = { userId: user.id, supabase };
  const groups = discover ? await listPublicGroups(actor) : await listMyGroups(actor);
  return ok(groups, { total: groups.length });
});

/** POST /api/groups — `{ name, description?, interests[], visibility }`; the creator becomes owner. */
export const POST = withAuth(async ({ user, supabase }, req) => {
  const body = await parseBody(groupCreateSchema, req);
  const group = await createGroup({ userId: user.id, supabase }, body);
  return ok(group, undefined, { status: 201 });
});
