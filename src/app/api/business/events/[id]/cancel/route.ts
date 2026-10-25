import { uuidSchema } from '@/shared/schemas/common';
import { ApiError, ok,  parseBody,  withBusinessOwner } from '@/lib/api';
import { cancelEventSchema } from '@/features/business/schemas';
import { businessDeps } from '@/features/business/server/context';
import { cancelBusinessEvent } from '@/features/business/server/events';

export const POST = withBusinessOwner(async (ctx, req, params) => {
    const parsedid = uuidSchema.safeParse(params.id);
    if (!parsedid.success) throw new ApiError('VALIDATION', 'Invalid id', 400);
    const id = parsedid.data;
    const { reason } = await parseBody(cancelEventSchema, req);
    return ok(await cancelBusinessEvent(businessDeps(ctx.supabase, ctx.user.id), ctx.business.id, id, reason));
});
