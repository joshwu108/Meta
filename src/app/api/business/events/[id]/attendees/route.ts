import { uuidSchema } from '@/shared/schemas/common';
import { ApiError, ok,   withBusinessOwner } from '@/lib/api';
import { businessDeps } from '@/features/business/server/context';
import { getEventAttendees } from '@/features/business/server/events';

/** Counts always; names only for attendees who consented (spec section 6). */
export const GET = withBusinessOwner(async (ctx, _req, params) => {
    const parsedid = uuidSchema.safeParse(params.id);
    if (!parsedid.success) throw new ApiError('VALIDATION', 'Invalid id', 400);
    const id = parsedid.data;
    return ok(await getEventAttendees(businessDeps(ctx.supabase), ctx.business.id, id));
});
