import { uuidSchema } from '@/shared/schemas/common';
import { ApiError, ok,  parseBody,  withBusinessOwner } from '@/lib/api';
import { proposalDecisionSchema } from '@/features/business/schemas';
import { businessDeps, requireVenueContext } from '@/features/business/server/context';
import { getBusinessProposal } from '@/features/business/server/proposals';
import { decideProposal } from '@/features/proposals/server/decide';

export const GET = withBusinessOwner(async (ctx, _req, params) => {
    const parsedid = uuidSchema.safeParse(params.id);
    if (!parsedid.success) throw new ApiError('VALIDATION', 'Invalid id', 400);
    const id = parsedid.data;
    const deps = businessDeps(ctx.supabase);
    return ok(await getBusinessProposal(deps, ctx.business.id, id));
});

/** `PATCH` — approve, edit & approve, or reject. Returns `{ proposal, event }`. */
export const PATCH = withBusinessOwner(async (ctx, req, params) => {
    const parsedid = uuidSchema.safeParse(params.id);
    if (!parsedid.success) throw new ApiError('VALIDATION', 'Invalid id', 400);
    const id = parsedid.data;
    const body = await parseBody(proposalDecisionSchema, req);
    const deps = businessDeps(ctx.supabase);
    const venue = await requireVenueContext(deps, ctx.business.id);
    return ok(await decideProposal(deps, ctx.business.id, venue, id, body));
});
