import { assertCanUseImport } from '@/features/import/server/flag';
import { deleteExpired, listPending } from '@/features/import/server/repo';
import { ok, withAuth } from '@/lib/api';

/** GET /api/import/suggestions: the user's pending suggestions (expired ones are deleted first). */
export const GET = withAuth(async ({ user }) => {
  await assertCanUseImport(user.id);
  await deleteExpired(user.id);
  return ok(await listPending(user.id));
});
