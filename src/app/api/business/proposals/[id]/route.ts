import { ok, param, parseBody, route, withBusinessOwner } from '@/lib/api/envelope';
import { proposalDecisionSchema } from '@/features/business/schemas';
import { businessDeps, requireVenueContext } from '@/features/business/server/context';
import { getBusinessProposal } from '@/features/business/server/proposals';
import { decideProposal } from '@/features/proposals/server/decide';

export const GET = route(
  withBusinessOwner(async (ctx, _req, { params }) => {
    const id = await param(params, 'id');
    const deps = businessDeps(ctx.supabase);
    return ok(await getBusinessProposal(deps, ctx.business.id, id));
  }),
);

/** `PATCH` — approve, edit & approve, or reject. Returns `{ proposal, event }`. */
export const PATCH = route(
  withBusinessOwner(async (ctx, req, { params }) => {
    const id = await param(params, 'id');
    const body = await parseBody(proposalDecisionSchema, req);
    const deps = businessDeps(ctx.supabase);
    const venue = await requireVenueContext(deps, ctx.business.id);
    return ok(await decideProposal(deps, ctx.business.id, venue, id, body));
  }),
);
