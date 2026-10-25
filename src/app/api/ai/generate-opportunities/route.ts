import { withAuth } from '@/lib/api';
import { handleGenerate } from '@/features/demand/server/routes';
import { routeDeps } from '@/features/demand/server/route-deps';

export const maxDuration = 60;

/** POST /api/ai/generate-opportunities: operator (or DEMO_MODE) trigger; returns { runId }. */
export const POST = withAuth(async (ctx, req) => handleGenerate(ctx, req, routeDeps()));
