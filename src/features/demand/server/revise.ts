import type { AvailabilitySlot } from '@/shared/enums';
import { MAX_REVISIONS, type ProposalDocument, type ReviseProposalRequest, type StoredProposal } from '../schemas';
import type { DemandConfig } from './config';
import type { ActionLogEntry } from './deps';
import { validateProposal, type ValidationIssue, type ValidationTarget } from './validate';
import { capabilitySummary, type CapabilitySummary, type Venue } from './venue';

/** A proposal as the owner's request client sees it, plus its cluster's budget for price bounds. */
export type RevisableProposal = {
  id: string;
  status: string;
  businessId: string;
  revision: number;
  proposal: StoredProposal;
  budgetP50Cents: number | null;
};

export type ReviseInput = {
  previous: ProposalDocument;
  changes: { priceCents: number | null; capacity: number | null; slot: AvailabilitySlot | null };
  ownerNote: string | null;
  business: Venue['card'];
  capabilities: CapabilitySummary;
  feedback?: string;
};

export type ReviseDeps = {
  config: Pick<DemandConfig, 'budgetHeadroom' | 'minDaysOut'>;
  now: () => Date;
  loadVenue: (businessId: string) => Promise<Venue | null>;
  generate: (input: ReviseInput) => Promise<ProposalDocument>;
  saveRevision: (input: { parentId: string; proposal: StoredProposal; request: ReviseProposalRequest }) => Promise<string>;
  logActions: (entries: readonly ActionLogEntry[]) => Promise<void>;
};

export type ReviseOutcome =
  | { kind: 'revised'; proposalId: string; proposal: StoredProposal }
  | { kind: 'not_pending' }
  | { kind: 'limit_reached' }
  | { kind: 'no_venue' }
  | { kind: 'over_capacity'; capacity: number }
  | { kind: 'llm_failure' }
  | { kind: 'rejected'; issues: ValidationIssue[] };

function withoutStart(proposal: StoredProposal): ProposalDocument {
  const { suggestedStartsAt: _startsAt, ...doc } = proposal;
  return doc;
}

/** The owner's explicit numbers win over the model's (overwrite, never trust). */
export function applyOverrides(doc: ProposalDocument, req: ReviseProposalRequest): ProposalDocument {
  return {
    ...doc,
    suggestedCapacity: req.capacity ?? doc.suggestedCapacity,
    suggestedSlot: req.slot ?? doc.suggestedSlot,
    suggestedPriceCents: req.priceCents ?? doc.suggestedPriceCents,
  };
}

/** The owner may pick a slot or price outside what their profile lists; capacity stays capped. */
export function ownerVenue(venue: Venue, req: ReviseProposalRequest): Venue {
  const c = venue.capabilities;
  const slot = req.slot;
  const price = req.priceCents;
  return {
    ...venue,
    capabilities: {
      ...c,
      hostingSlots: slot && c.hostingSlots.length > 0 && !c.hostingSlots.includes(slot) ? [...c.hostingSlots, slot] : c.hostingSlots,
      minPriceCents: price == null ? c.minPriceCents : Math.min(c.minPriceCents ?? price, price),
      maxPriceCents: price == null ? c.maxPriceCents : Math.max(c.maxPriceCents ?? price, price),
    },
  };
}

/** Category, band and audience never change in a revision; only the slot may. */
export function revisionTarget(row: RevisableProposal, req: ReviseProposalRequest): ValidationTarget {
  const { demand } = row.proposal;
  return {
    slot: req.slot ?? row.proposal.suggestedSlot,
    category: row.proposal.category,
    band: demand.band,
    neighborhoodLabel: demand.neighborhoodLabel,
    topInterests: demand.topInterests.map((tag) => ({ tag, count: 0 })),
    budgetP50Cents: row.budgetP50Cents,
  };
}

function precheck(row: RevisableProposal, venue: Venue | null, req: ReviseProposalRequest): ReviseOutcome | null {
  if (row.status !== 'pending') return { kind: 'not_pending' };
  if (row.revision >= MAX_REVISIONS) return { kind: 'limit_reached' };
  if (!venue) return { kind: 'no_venue' };
  if (req.capacity != null && req.capacity > venue.capabilities.capacity) {
    return { kind: 'over_capacity', capacity: venue.capabilities.capacity };
  }
  return null;
}

/** Spec §6 P1: regenerate the proposal with the owner's numbers and note, validate, store as a new version. */
export async function reviseProposal(row: RevisableProposal, req: ReviseProposalRequest, deps: ReviseDeps): Promise<ReviseOutcome> {
  const venue = await deps.loadVenue(row.businessId);
  const blocked = precheck(row, venue, req);
  if (blocked || !venue) return blocked ?? { kind: 'no_venue' };
  const checkVenue = ownerVenue(venue, req);
  const target = revisionTarget(row, req);
  const base: ReviseInput = {
    previous: withoutStart(row.proposal),
    changes: { priceCents: req.priceCents ?? null, capacity: req.capacity ?? null, slot: req.slot ?? null },
    ownerNote: req.note ?? null,
    business: venue.card,
    capabilities: capabilitySummary(venue),
  };
  let feedback: string | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let doc: ProposalDocument;
    try {
      doc = applyOverrides(await deps.generate(feedback ? { ...base, feedback } : base), req);
    } catch {
      return { kind: 'llm_failure' };
    }
    const result = validateProposal(doc, target, checkVenue, deps.now(), deps.config);
    if (!result.ok) {
      if (attempt === 1) return { kind: 'rejected', issues: result.issues };
      feedback = `The previous draft failed checks: ${result.issues.join(', ')}. Fix them.`;
      continue;
    }
    const proposalId = await deps.saveRevision({ parentId: row.id, proposal: result.proposal, request: req });
    await deps.logActions([{ userId: null, actor: 'planning_agent', action: 'revise_proposal', permissionsUsed: [], result: result.proposal.title }]);
    return { kind: 'revised', proposalId, proposal: result.proposal };
  }
  return { kind: 'rejected', issues: [] };
}
