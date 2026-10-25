import 'server-only';
import { ApiError } from '@/lib/api/errors';
import type { ProposalStatus } from '@/shared/enums';
import type { ProposalDetail, ProposalSummary } from '@/shared/types';
import type { BusinessDeps } from './deps';
import type { ProposalRow } from './store';
import { nextSlotOccurrence } from './time';

/**
 * The proposal inbox (spec section 6). Every field here comes from the immutable
 * `ProposalDocument` workstream 04 wrote, which already carries `demand.band` and never a
 * raw `member_count`; nothing in this module reads `demand_clusters`.
 */

function suggestedStartsAt(row: ProposalRow, deps: BusinessDeps): string | null {
  if (row.proposal.suggestedStartsAt) return row.proposal.suggestedStartsAt;
  try {
    return nextSlotOccurrence(row.proposal.suggestedSlot, row.proposal.suggestedStartTimeLocal, {
      from: deps.now(),
      timezone: deps.timezone,
    }).toISOString();
  } catch {
    return null;
  }
}

export function toProposalSummary(row: ProposalRow, deps: BusinessDeps): ProposalSummary {
  return {
    id: row.id,
    status: row.status,
    title: row.proposal.title,
    category: row.proposal.category,
    suggestedSlot: row.proposal.suggestedSlot,
    suggestedStartsAt: suggestedStartsAt(row, deps),
    demand: row.proposal.demand,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    resultingEventId: row.resulting_event_id,
  };
}

export function toProposalDetail(row: ProposalRow, deps: BusinessDeps): ProposalDetail {
  return {
    ...toProposalSummary(row, deps),
    proposal: row.proposal,
    businessEdits: row.business_edits,
    decisionNote: row.decision_note,
    decidedAt: row.decided_at,
  };
}

export async function listBusinessProposals(
  deps: BusinessDeps,
  businessId: string,
  status?: ProposalStatus,
): Promise<ProposalSummary[]> {
  const rows = await deps.store.listProposals(businessId, status);
  return rows.map((row) => toProposalSummary(row, deps));
}

/** Another owner's proposal is indistinguishable from one that does not exist. */
export async function requireOwnedProposal(
  deps: BusinessDeps,
  businessId: string,
  proposalId: string,
): Promise<ProposalRow> {
  const row = await deps.store.findProposal(proposalId);
  if (!row || row.business_id !== businessId) {
    throw new ApiError('NOT_FOUND', 'proposal does not exist');
  }
  return row;
}

export async function getBusinessProposal(
  deps: BusinessDeps,
  businessId: string,
  proposalId: string,
): Promise<ProposalDetail> {
  return toProposalDetail(await requireOwnedProposal(deps, businessId, proposalId), deps);
}

/** Badge count for the Proposals nav item (spec section 7). */
export async function countPendingProposals(deps: BusinessDeps, businessId: string): Promise<number> {
  return (await deps.store.listProposals(businessId, 'pending')).length;
}
