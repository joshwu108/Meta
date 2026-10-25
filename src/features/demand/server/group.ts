import type { GroupVenueRequest } from '@/features/groups';
import type { StoredProposal } from '../schemas';
import { toBand } from './aggregate';
import type { PipelineDeps } from './deps';
import { draft, pickVenue, proposalNotice, type VenueNeed } from './process-cluster';
import type { ValidationIssue, ValidationTarget } from './validate';
import { capabilitySummary, type Venue } from './venue';

export type { GroupVenueRequest };

export type GroupKey = { groupId: string; planId: string; suggestionIndex: number };

export type GroupDeps = Pick<PipelineDeps, 'config' | 'now' | 'findCandidates' | 'loadVenue' | 'generate' | 'notify' | 'logActions'> & {
  hasPendingGroupProposal: (key: GroupKey) => Promise<boolean>;
  /** Inserts the pending proposal; returns null when another request for the same suggestion won. */
  saveGroupProposal: (input: { key: GroupKey; businessId: string; proposal: StoredProposal }) => Promise<string | null>;
};

export type GroupOutcome =
  | { kind: 'created'; proposalId: string; venue: Venue; proposal: StoredProposal }
  | { kind: 'duplicate' }
  | { kind: 'too_small'; minimum: number }
  | { kind: 'no_location' }
  | { kind: 'unmatched' }
  | { kind: 'llm_failure' }
  | { kind: 'rejected'; issues: ValidationIssue[] };

type Located = GroupVenueRequest & { centerLat: number; centerLng: number; neighborhoodLabel: string };

/**
 * The group's budget ceiling becomes the price bound: the validator allows up to
 * budgetP50 × headroom, so budgetP50 = ceiling / headroom.
 */
function venueNeed(req: Located, headroom: number): VenueNeed {
  return {
    category: req.category,
    slot: req.slot,
    memberCount: req.memberCount,
    center: { lat: req.centerLat, lng: req.centerLng },
    budgetP50Cents: req.budgetMaxCents == null ? null : Math.round(req.budgetMaxCents / headroom),
  };
}

/** Group proposals carry no interest tag counts; activity tags already meet 03's two-member floor. */
function target(req: Located, need: VenueNeed): ValidationTarget {
  return { category: req.category, slot: req.slot, band: toBand(req.memberCount), neighborhoodLabel: req.neighborhoodLabel, topInterests: [], budgetP50Cents: need.budgetP50Cents };
}

function precheck(req: GroupVenueRequest, minCohortSize: number): GroupOutcome | null {
  if (req.memberCount < minCohortSize) return { kind: 'too_small', minimum: minCohortSize };
  if (req.centerLat == null || req.centerLng == null || req.neighborhoodLabel == null) return { kind: 'no_location' };
  return null;
}

/** Spec §3 P1: turn one voted group idea into a pending proposal for the best nearby venue. */
export async function proposeForGroup(req: GroupVenueRequest, deps: GroupDeps): Promise<GroupOutcome> {
  const blocked = precheck(req, deps.config.minCohortSize);
  if (blocked) return blocked;
  const located = req as Located;
  const key: GroupKey = { groupId: req.groupId, planId: req.planId, suggestionIndex: req.suggestionIndex };
  if (await deps.hasPendingGroupProposal(key)) return { kind: 'duplicate' };
  const need = venueNeed(located, deps.config.budgetHeadroom);
  const venue = await pickVenue(need, deps, new Map());
  if (!venue) return { kind: 'unmatched' };
  const t = target(located, need);
  const brief = {
    category: req.category, slot: req.slot, neighborhoodLabel: t.neighborhoodLabel, demandBand: t.band, topInterests: [],
    groupSizeMode: req.groupSizeMode, budgetP50Cents: need.budgetP50Cents, activityPrefs: req.activityPrefs,
  };
  const groupIdea = { title: req.title, description: req.description };
  const outcome = await draft({ brief, business: venue.card, capabilities: capabilitySummary(venue), groupIdea }, t, venue, deps);
  if (outcome.kind !== 'drafted') return outcome;
  const proposalId = await deps.saveGroupProposal({ key, businessId: venue.match.businessId, proposal: outcome.proposal });
  if (!proposalId) return { kind: 'duplicate' };
  await deps.notify(venue.ownerId, 'proposal_received', proposalNotice(proposalId, outcome.proposal.title, t.band));
  await deps.logActions([{ userId: null, actor: 'planning_agent', action: 'generate_proposal', permissionsUsed: ['group_plan'], result: outcome.proposal.title }]);
  return { kind: 'created', proposalId, venue, proposal: outcome.proposal };
}
