import { ok, param, parseBody, route, withBusinessOwner } from '@/lib/api/envelope';
import { cancelEventSchema } from '@/features/business/schemas';
import { businessDeps } from '@/features/business/server/context';
import { cancelBusinessEvent } from '@/features/business/server/events';

export const POST = route(
  withBusinessOwner(async (ctx, req, { params }) => {
    const id = await param(params, 'id');
    const { reason } = await parseBody(cancelEventSchema, req);
    return ok(await cancelBusinessEvent(businessDeps(ctx.supabase), ctx.business.id, id, reason));
  }),
);
