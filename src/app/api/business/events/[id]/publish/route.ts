import { uuidSchema } from '@/shared/schemas/common';
import { ApiError, ok,   withBusinessOwner } from '@/lib/api';
import { businessDeps } from '@/features/business/server/context';
import { publishBusinessEvent } from '@/features/business/server/events';

export const POST = withBusinessOwner(async (ctx, _req, params) => {
    const parsedid = uuidSchema.safeParse(params.id);
    if (!parsedid.success) throw new ApiError('VALIDATION', 'Invalid id', 400);
    const id = parsedid.data;
    return ok(await publishBusinessEvent(businessDeps(ctx.supabase), ctx.business.id, id));
});
