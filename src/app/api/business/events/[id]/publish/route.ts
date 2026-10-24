import { ok, param, route, withBusinessOwner } from '@/lib/api/envelope';
import { businessDeps } from '@/features/business/server/context';
import { publishBusinessEvent } from '@/features/business/server/events';

export const POST = route(
  withBusinessOwner(async (ctx, _req, { params }) => {
    const id = await param(params, 'id');
    return ok(await publishBusinessEvent(businessDeps(ctx.supabase), ctx.business.id, id));
  }),
);
