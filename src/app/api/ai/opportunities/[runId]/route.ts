import { withAuth } from '@/lib/api';
import { handleRunStatus } from '@/features/demand/server/routes';
import { routeDeps } from '@/features/demand/server/route-deps';

/** GET /api/ai/opportunities/:runId: run status, stats and proposals for the operator tracker. */
export const GET = withAuth(async (ctx, _req, params) => handleRunStatus(ctx, params['runId'], routeDeps()));
