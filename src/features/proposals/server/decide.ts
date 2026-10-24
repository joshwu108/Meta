import 'server-only';
import { ApiError } from '@/lib/api/errors';
import type { BusinessEvent, EventEdits, ProposalDetail } from '@/shared/types';
import type { BusinessDeps } from '@/features/business/server/deps';
import {
  getBusinessEvent,
  publishBusinessEvent,
  type VenueContext,
} from '@/features/business/server/events';
import { requireOwnedProposal, toProposalDetail } from '@/features/business/server/proposals';
import {
  resolveEventFromProposal,
  validateEventAgainstCapabilities,
} from '@/features/business/server/validate';
import type { ProposalDecisionBody } from '@/features/business/schemas';

/**
 * `decideProposal` (spec section 5) — approve, edit & approve, or reject.
 *
 * The event insert and the proposal update happen inside the `decide_proposal` Postgres
 * function so a proposal can never read `approved` without the event it points at
 * (spec section 9, T-I2). Merging and the capability checks happen here, before the call,
 * so they stay unit-testable without a database.
 */

export type DecideResult = { proposal: ProposalDetail; event: BusinessEvent | null };

export async function decideProposal(
  deps: BusinessDeps,
  businessId: string,
  venue: VenueContext,
  proposalId: string,
  body: ProposalDecisionBody,
): Promise<DecideResult> {
  const row = await requireOwnedProposal(deps, businessId, proposalId);
  if (row.status !== 'pending') {
    throw new ApiError('CONFLICT', `this proposal was already ${row.status}`);
  }

  const note = body.note ?? null;

  if (body.decision === 'reject') {
    await deps.store.decideProposal({
      proposalId,
      decision: 'reject',
      edits: null,
      note: body.reason ? `${body.reason}${note ? `: ${note}` : ''}` : note,
      event: null,
    });
    await deps.logAgentAction({
      actor: 'planning_agent',
    userId: businessId,
      action: 'reject_proposal',
      permissionsUsed: [],
      result: `${row.proposal.title} (${body.reason ?? 'other'})`,
    });
    return { proposal: await reload(deps, businessId, proposalId), event: null };
  }

  const edits: EventEdits | null = body.edits ?? null;
  const fields = resolveEventFromProposal(row.proposal, edits ?? undefined, {
    from: deps.now(),
    timezone: deps.timezone,
  });
  validateEventAgainstCapabilities(fields, venue.capabilities, venue.hours, {
    timezone: deps.timezone,
  });

  const result = await deps.store.decideProposal({
    proposalId,
    decision: body.decision,
    edits,
    note,
    event: {
      business_id: businessId,
      proposal_id: proposalId,
      source: 'ai_proposal',
      title: fields.title,
      description: fields.description,
      category: fields.category,
      format: fields.format,
      starts_at: fields.startsAt,
      ends_at: fields.endsAt,
      capacity: fields.capacity,
      price_cents: fields.priceCents,
    },
  });

  if (!result.eventId) {
    throw new ApiError('INTERNAL', 'the proposal was approved but no event was created');
  }

  await deps.logAgentAction({
    actor: 'planning_agent',
    userId: businessId,
    action: body.decision === 'approve' ? 'approve_proposal' : 'modify_proposal',
    permissionsUsed: [],
    result: fields.title,
  });

  const event = body.publish
    ? await publishBusinessEvent(deps, businessId, result.eventId)
    : await getBusinessEvent(deps, businessId, result.eventId);

  return { proposal: await reload(deps, businessId, proposalId), event };
}

async function reload(
  deps: BusinessDeps,
  businessId: string,
  proposalId: string,
): Promise<ProposalDetail> {
  return toProposalDetail(await requireOwnedProposal(deps, businessId, proposalId), deps);
}

