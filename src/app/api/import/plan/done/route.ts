import { z } from 'zod';
import { assertCanUseImport } from '@/features/import/server/flag';
import { markStepDone, readPlan } from '@/features/import/server/plan';
import { ok, parseBody, withAuth } from '@/lib/api';

const DoneSchema = z.object({ key: z.string().min(3).max(120) });

/** POST /api/import/plan/done: the user marks a place or group step done themselves. */
export const POST = withAuth(async ({ user }, req) => {
  await assertCanUseImport(user.id);
  const { key } = await parseBody(DoneSchema, req);
  await markStepDone(user.id, key);
  return ok(await readPlan(user.id));
});
