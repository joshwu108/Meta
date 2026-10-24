import { ok, route, withBusinessOwner } from '@/lib/api/envelope';
import { businessDeps } from '@/features/business/server/context';
import { getBusinessInsights } from '@/features/business/server/insights';

export const GET = route(
  withBusinessOwner(async (ctx) => {
    return ok(await getBusinessInsights(businessDeps(ctx.supabase), ctx.business.id));
  }),
);
