import { ok, parseBody, route, withBusinessOwner } from '@/lib/api/envelope';
import { eventInputSchema } from '@/features/business/schemas';
import { businessDeps, requireVenueContext } from '@/features/business/server/context';
import { createManualEvent, listBusinessEvents } from '@/features/business/server/events';

/** `GET /api/business/events` — mine, with `confirmedCount` (0 until workstream 06 lands). */
export const GET = route(
  withBusinessOwner(async (ctx) => {
    const events = await listBusinessEvents(businessDeps(ctx.supabase), ctx.business.id);
    return ok(events, { total: events.length });
  }),
);

export const POST = route(
  withBusinessOwner(async (ctx, req) => {
    const input = await parseBody(eventInputSchema, req);
    const deps = businessDeps(ctx.supabase);
    const venue = await requireVenueContext(deps, ctx.business.id);
    const event = await createManualEvent(deps, ctx.business.id, venue, input);
    return ok(event, undefined, { status: 201 });
  }),
);
