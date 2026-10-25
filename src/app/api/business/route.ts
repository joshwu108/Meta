import { ok, parseBody,  withAuth } from '@/lib/api';
import { businessOnboardingSchema } from '@/features/business/schemas';
import { businessDeps } from '@/features/business/server/context';
import { createBusinessForOwner } from '@/features/business/server/businesses';

/** `POST /api/business` — onboarding submit. The one 05 route that is not owner-guarded. */
export const POST = withAuth(async (ctx, req) => {
    const input = await parseBody(businessOnboardingSchema, req);
    const deps = businessDeps(ctx.supabase, ctx.user.id);
    const business = await createBusinessForOwner(deps, ctx.user.id, input);
    return ok(business, undefined, { status: 201 });
});
