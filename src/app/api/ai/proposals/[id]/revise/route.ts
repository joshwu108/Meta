import { withAuth } from '@/lib/api';
import { handleRevise } from '@/features/demand/server/revise-route';
import { reviseRouteDeps } from '@/features/demand/server/route-deps';

export const maxDuration = 60;

/** POST /api/ai/proposals/:id/revise: the owning business asks for a rewrite with new numbers or a note. */
export const POST = withAuth(async (ctx, req, params) => handleRevise(ctx, params['id'], req, reviseRouteDeps()));
