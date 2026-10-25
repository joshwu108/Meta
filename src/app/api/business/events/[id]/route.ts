import { uuidSchema } from '@/shared/schemas/common';
import { ApiError, ok,  parseBody,  withBusinessOwner } from '@/lib/api';
import { eventEditsSchema } from '@/features/business/schemas';
import { businessDeps, requireVenueContext } from '@/features/business/server/context';
import { getBusinessEvent, updateBusinessEvent } from '@/features/business/server/events';

export const GET = withBusinessOwner(async (ctx, _req, params) => {
    const parsedid = uuidSchema.safeParse(params.id);
    if (!parsedid.success) throw new ApiError('VALIDATION', 'Invalid id', 400);
    const id = parsedid.data;
    return ok(await getBusinessEvent(businessDeps(ctx.supabase, ctx.user.id), ctx.business.id, id));
});

/** `PATCH` — edits the allowed fields and triggers the reconfirm notifications. */
export const PATCH = withBusinessOwner(async (ctx, req, params) => {
    const parsedid = uuidSchema.safeParse(params.id);
    if (!parsedid.success) throw new ApiError('VALIDATION', 'Invalid id', 400);
    const id = parsedid.data;
    const edits = await parseBody(eventEditsSchema, req);
    const deps = businessDeps(ctx.supabase, ctx.user.id);
    const venue = await requireVenueContext(deps, ctx.business.id);
    return ok(await updateBusinessEvent(deps, ctx.business.id, id, venue, edits));
});
