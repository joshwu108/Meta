import { ok, param, parseBody, route, withBusinessOwner } from '@/lib/api/envelope';
import { eventEditsSchema } from '@/features/business/schemas';
import { businessDeps, requireVenueContext } from '@/features/business/server/context';
import { getBusinessEvent, updateBusinessEvent } from '@/features/business/server/events';

export const GET = route(
  withBusinessOwner(async (ctx, _req, { params }) => {
    const id = await param(params, 'id');
    return ok(await getBusinessEvent(businessDeps(ctx.supabase), ctx.business.id, id));
  }),
);

/** `PATCH` — edits the allowed fields and triggers the reconfirm notifications. */
export const PATCH = route(
  withBusinessOwner(async (ctx, req, { params }) => {
    const id = await param(params, 'id');
    const edits = await parseBody(eventEditsSchema, req);
    const deps = businessDeps(ctx.supabase);
    const venue = await requireVenueContext(deps, ctx.business.id);
    return ok(await updateBusinessEvent(deps, ctx.business.id, id, venue, edits));
  }),
);
