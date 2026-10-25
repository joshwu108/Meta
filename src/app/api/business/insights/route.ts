import { ok,  withBusinessOwner } from '@/lib/api';
import { businessDeps } from '@/features/business/server/context';
import { getBusinessInsights } from '@/features/business/server/insights';

export const GET = withBusinessOwner(async (ctx) => {
    return ok(await getBusinessInsights(businessDeps(ctx.supabase, ctx.user.id), ctx.business.id));
});
