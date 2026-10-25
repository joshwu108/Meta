import { fail, ok, parseBody,  withAuth, withBusinessOwner } from '@/lib/api';
import { businessUpdateSchema } from '@/features/business/schemas';
import { businessDeps } from '@/features/business/server/context';
import { getOwnerBusiness, updateOwnerBusiness } from '@/features/business/server/businesses';

/** `GET /api/business/me` — null-ish accounts get NOT_FOUND so the UI can route to onboarding. */
export const GET = withAuth(async (ctx) => {
    const business = await getOwnerBusiness(businessDeps(ctx.supabase, ctx.user.id), ctx.user.id);
    if (!business) return fail('NOT_FOUND', 'this account does not own a business yet');
    return ok(business);
});

export const PATCH = withBusinessOwner(async (ctx, req) => {
    const input = await parseBody(businessUpdateSchema, req);
    const deps = businessDeps(ctx.supabase, ctx.user.id);
    return ok(await updateOwnerBusiness(deps, ctx.business.id, input));
});
