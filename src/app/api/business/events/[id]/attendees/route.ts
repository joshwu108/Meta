import { ok, param, route, withBusinessOwner } from '@/lib/api/envelope';
import { businessDeps } from '@/features/business/server/context';
import { getEventAttendees } from '@/features/business/server/events';

/** Counts always; names only for attendees who consented (spec section 6). */
export const GET = route(
  withBusinessOwner(async (ctx, _req, { params }) => {
    const id = await param(params, 'id');
    return ok(await getEventAttendees(businessDeps(ctx.supabase), ctx.business.id, id));
  }),
);
