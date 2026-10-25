import { ok,  withBusinessOwner } from '@/lib/api';
import { PROPOSAL_STATUS, type ProposalStatus } from '@/shared/enums';
import { businessDeps } from '@/features/business/server/context';
import { listBusinessProposals } from '@/features/business/server/proposals';

/** `GET /api/business/proposals?status=pending` — banded demand only. */
export const GET = withBusinessOwner(async (ctx, req) => {
    const requested = new URL(req.url).searchParams.get('status');
    const status = PROPOSAL_STATUS.includes(requested as ProposalStatus)
      ? (requested as ProposalStatus)
      : undefined;

    const deps = businessDeps(ctx.supabase, ctx.user.id);
    const proposals = await listBusinessProposals(deps, ctx.business.id, status);
    return ok(proposals, { total: proposals.length });
});
