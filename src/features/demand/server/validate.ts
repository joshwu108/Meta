import { FORBIDDEN_PHRASES, type ProposalDocument, type StoredProposal } from '../schemas';
import { attendanceEstimate, type AggregatedCluster } from './aggregate';
import type { DemandConfig } from './config';
import { nextSlotStart } from './time';
import type { Venue } from './venue';

export type ValidationIssue =
  | 'over_capacity'
  | 'slot_mismatch'
  | 'slot_not_hosted'
  | 'price_out_of_range'
  | 'forbidden_phrase'
  | 'category_mismatch';

/** What a draft is checked against: a fresh cluster, or (for a revision) the previous proposal. */
export type ValidationTarget = Pick<AggregatedCluster, 'slot' | 'category' | 'band' | 'neighborhoodLabel' | 'topInterests' | 'budgetP50Cents'>;

export type ValidationResult =
  | { ok: true; proposal: StoredProposal }
  | { ok: false; issues: ValidationIssue[] };

export function findForbiddenPhrases(text: string): string[] {
  const lower = text.toLowerCase();
  return FORBIDDEN_PHRASES.filter((p) => new RegExp(`\\b${p}\\b`).test(lower));
}

function priceBounds(cluster: ValidationTarget, venue: Venue, headroom: number): { min: number; max: number } | null {
  const { minPriceCents, maxPriceCents } = venue.capabilities;
  if (minPriceCents != null || maxPriceCents != null) {
    return { min: minPriceCents ?? 0, max: maxPriceCents ?? Number.MAX_SAFE_INTEGER };
  }
  return cluster.budgetP50Cents == null ? null : { min: 0, max: Math.round(cluster.budgetP50Cents * headroom) };
}

function collectIssues(doc: ProposalDocument, cluster: ValidationTarget, venue: Venue, config: Pick<DemandConfig, 'budgetHeadroom'>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const hosted = venue.capabilities.hostingSlots;
  if (doc.suggestedCapacity > venue.capabilities.capacity) issues.push('over_capacity');
  if (doc.suggestedSlot !== cluster.slot) issues.push('slot_mismatch');
  if (hosted.length > 0 && !hosted.includes(doc.suggestedSlot)) issues.push('slot_not_hosted');
  if (doc.category !== cluster.category) issues.push('category_mismatch');
  const bounds = priceBounds(cluster, venue, config.budgetHeadroom);
  const price = doc.suggestedPriceCents;
  if (price != null && bounds && (price < bounds.min || price > bounds.max)) issues.push('price_out_of_range');
  if (findForbiddenPhrases(`${doc.title}\n${doc.description}\n${doc.whySuggested}`).length > 0) issues.push('forbidden_phrase');
  return issues;
}

/**
 * Spec §5.8, enforced in code. The model's demand fields are never trusted: band, label and
 * interests are overwritten from the cluster, and the disclaimer is always present.
 */
export function validateProposal(
  doc: ProposalDocument,
  cluster: ValidationTarget,
  venue: Venue,
  now: Date,
  config: Pick<DemandConfig, 'budgetHeadroom' | 'minDaysOut'>,
): ValidationResult {
  const issues = collectIssues(doc, cluster, venue, config);
  if (issues.length > 0) return { ok: false, issues };
  const startsAt = nextSlotStart(cluster.slot, doc.suggestedStartTimeLocal, now, config.minDaysOut);
  return {
    ok: true,
    proposal: {
      ...doc,
      demand: {
        band: cluster.band,
        neighborhoodLabel: cluster.neighborhoodLabel,
        topInterests: cluster.topInterests.slice(0, 5).map((t) => t.tag),
      },
      disclaimers: ['demand_is_estimate'],
      suggestedStartsAt: startsAt.toISOString(),
      attendanceEstimate: attendanceEstimate(cluster.band, doc.suggestedCapacity),
    },
  };
}
