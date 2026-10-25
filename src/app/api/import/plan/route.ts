import { assertCanUseImport } from '@/features/import/server/flag';
import { buildPlan, readPlan } from '@/features/import/server/plan';
import { ok, withAuth } from '@/lib/api';

export const maxDuration = 60;

/**
 * GET /api/import/plan: "Your plan". Builds one when none exists or with `?refresh=1` (after the
 * user saves review decisions). Every step is a link the user follows; nothing is done for them.
 */
export const GET = withAuth(async ({ user, supabase }, req) => {
  await assertCanUseImport(user.id);
  const refresh = new URL(req.url).searchParams.get('refresh') === '1';
  if (refresh || !(await readPlan(user.id))) await buildPlan({ userId: user.id, supabase });
  return ok(await readPlan(user.id));
});
