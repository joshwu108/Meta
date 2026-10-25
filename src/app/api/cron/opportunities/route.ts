import { withPublic } from '@/lib/api';
import { handleCron } from '@/features/demand/server/routes';
import { routeDeps } from '@/features/demand/server/route-deps';

export const maxDuration = 60;

/** GET /api/cron/opportunities: public route guarded by the OPPORTUNITY_CRON_SECRET bearer token (Vercel Cron). */
export const GET = withPublic(async (req) => handleCron(req, routeDeps()));
