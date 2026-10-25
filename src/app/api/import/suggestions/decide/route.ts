import { DecideRequestSchema } from '@/features/import/schemas';
import { decideSuggestions } from '@/features/import/server/decide';
import { assertCanUseImport } from '@/features/import/server/flag';
import { ok, parseBody, withAuth } from '@/lib/api';

/** POST /api/import/suggestions/decide: one all-or-nothing batch of review taps. */
export const POST = withAuth(async ({ user }, req) => {
  await assertCanUseImport(user.id);
  const body = await parseBody(DecideRequestSchema, req);
  return ok(await decideSuggestions(user.id, body));
});
