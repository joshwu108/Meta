import { ApiError, ok, withPublic } from '@/lib/api';
import { serverEnv } from '@/lib/env';
import { runSeed } from '@/features/core/server/seed';

/**
 * POST /api/dev/seed — reload the demo dataset. Public route, but it is only mounted when
 * NODE_ENV !== 'production' or DEMO_MODE=1 (specs §6); otherwise it answers NOT_FOUND.
 */
export const POST = withPublic(async () => {
  if (serverEnv.isProduction && !serverEnv.isDemoMode) {
    throw new ApiError('NOT_FOUND', 'Not found', 404);
  }
  const summary = await runSeed();
  return ok(summary);
});
