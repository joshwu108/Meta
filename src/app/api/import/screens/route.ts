import { assertCanUseImport } from '@/features/import/server/flag';
import { runScreensImport, SHARE_SOURCES, type ShareSource } from '@/features/import/server/run';
import { ApiError, ok, withAuth } from '@/lib/api';

// Vision on up to four screenshots can take a while.
export const maxDuration = 60;

/**
 * POST /api/import/screens (multipart): `images` (1–4 files) and `sources` (the toggles the user
 * chose). The files are read into memory, validated by magic bytes, sent to the vision prompt
 * and dropped. Only pending suggestions are stored.
 */
export const POST = withAuth(async ({ user, supabase }, req) => {
  await assertCanUseImport(user.id);
  const form = await req.formData().catch(() => {
    throw new ApiError('VALIDATION', 'Send the screenshots as multipart form data', 400, { field: 'images' });
  });
  const files = form.getAll('images').filter((value): value is File => typeof value !== 'string');
  const sources = [...new Set(form.getAll('sources').map(String))].filter((s): s is ShareSource =>
    (SHARE_SOURCES as readonly string[]).includes(s),
  );
  if (sources.length === 0) throw new ApiError('VALIDATION', 'Choose what you are sharing', 400, { field: 'sources' });
  const bytes = await Promise.all(files.map(async (file) => new Uint8Array(await file.arrayBuffer())));
  return ok(await runScreensImport(supabase, user.id, bytes, sources), undefined, { status: 201 });
});
