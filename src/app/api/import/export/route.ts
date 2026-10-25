import { ExportLabelsSchema } from '@/features/import/schemas';
import { assertCanUseImport } from '@/features/import/server/flag';
import { runExportImport } from '@/features/import/server/run';
import { ok, parseBody, withAuth } from '@/lib/api';

export const maxDuration = 60;

/** POST /api/import/export: topic and ad-interest labels the browser pulled out of the export file. */
export const POST = withAuth(async ({ user }, req) => {
  await assertCanUseImport(user.id);
  const labels = await parseBody(ExportLabelsSchema, req);
  return ok(await runExportImport(user.id, labels), undefined, { status: 201 });
});
