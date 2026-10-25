import { z } from 'zod';
import { assertCanUseImport } from '@/features/import/server/flag';
import { deleteImportData, getImportSettings } from '@/features/import/server/settings';
import { ok, parseBody, withAuth } from '@/lib/api';

/** GET /api/import/data: what came from Instagram (owner only). */
export const GET = withAuth(async ({ user }) => {
  await assertCanUseImport(user.id);
  return ok(await getImportSettings(user.id));
});

const DeleteSchema = z.object({ acceptedTraits: z.enum(['keep', 'remove']) });

/** DELETE /api/import/data: "Delete my Instagram data". The keep/remove choice is required, never defaulted. */
export const DELETE = withAuth(async ({ user }, req) => {
  await assertCanUseImport(user.id);
  const { acceptedTraits } = await parseBody(DeleteSchema, req);
  return ok(await deleteImportData(user.id, acceptedTraits));
});
