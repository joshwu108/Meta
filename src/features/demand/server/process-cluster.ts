import type { StoredProposal } from '../schemas';
import { toBrief, type AggregatedCluster } from './aggregate';
import type { GenerateInput, PipelineDeps } from './deps';
import { validateProposal, type ValidationIssue, type ValidationTarget } from './validate';
import { capabilitySummary, type Venue } from './venue';

export type ClusterOutcome =
  | { kind: 'created'; proposalId: string; venue: Venue; proposal: StoredProposal }
  | { kind: 'drafted'; venue: Venue; proposal: StoredProposal }
  | { kind: 'duplicate' }
  | { kind: 'unmatched' }
  | { kind: 'llm_failure' }
  | { kind: 'rejected'; issues: ValidationIssue[] };

const DAY_MS = 86_400_000;

/** What venue matching needs: a demand cluster or a group's voted idea. */
export type VenueNeed = Pick<AggregatedCluster, 'category' | 'memberCount' | 'slot' | 'center' | 'budgetP50Cents'>;

/** Spec §5.6: best candidate that has room this run. 05 already ranks and enforces capacity. */
export async function pickVenue(
  cluster: VenueNeed,
  deps: Pick<PipelineDeps, 'config' | 'findCandidates' | 'loadVenue'>,
  usedByBusiness: ReadonlyMap<string, number>,
): Promise<Venue | null> {
  const matches = await deps.findCandidates({
    category: cluster.category,
    cohortSize: cluster.memberCount,
    slot: cluster.slot,
    centerLat: cluster.center.lat,
    centerLng: cluster.center.lng,
    radiusKm: deps.config.venueRadiusKm,
    budgetMax: cluster.budgetP50Cents == null ? null : Math.round(cluster.budgetP50Cents * deps.config.budgetHeadroom),
  });
  for (const match of matches) {
    if ((usedByBusiness.get(match.businessId) ?? 0) >= deps.config.maxProposalsPerBusinessPerRun) continue;
    const venue = await deps.loadVenue(match);
    if (venue && venue.capabilities.capacity >= cluster.memberCount) return venue;
  }
  return null;
}

export type DraftOutcome = Extract<ClusterOutcome, { kind: 'drafted' | 'llm_failure' | 'rejected' }>;

/** Generate, validate, and on a validation failure regenerate once with the issues as feedback. */
export async function draft(
  base: Omit<GenerateInput, 'feedback'>,
  target: ValidationTarget,
  venue: Venue,
  deps: Pick<PipelineDeps, 'generate' | 'now' | 'config'>,
): Promise<DraftOutcome> {
  let feedback: string | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let doc;
    try {
      doc = await deps.generate(feedback ? { ...base, feedback } : base);
    } catch {
      return { kind: 'llm_failure' };
    }
    const result = validateProposal(doc, target, venue, deps.now(), deps.config);
    if (result.ok) return { kind: 'drafted', venue, proposal: result.proposal };
    if (attempt === 1) return { kind: 'rejected', issues: result.issues };
    feedback = `The previous draft failed checks: ${result.issues.join(', ')}. Fix them.`;
  }
  return { kind: 'rejected', issues: [] };
}

export async function processCluster(
  cluster: AggregatedCluster,
  deps: PipelineDeps,
  ctx: { runId: string; dryRun: boolean; usedByBusiness: ReadonlyMap<string, number> },
): Promise<ClusterOutcome> {
  const since = new Date(deps.now().getTime() - deps.config.duplicateWindowDays * DAY_MS);
  if (await deps.hasRecentPendingProposal(cluster.signature, since)) return { kind: 'duplicate' };
  const venue = await pickVenue(cluster, deps, ctx.usedByBusiness);
  if (!venue) return { kind: 'unmatched' };
  const base = { brief: toBrief(cluster), business: venue.card, capabilities: capabilitySummary(venue) };
  const outcome = await draft(base, cluster, venue, deps);
  if (outcome.kind !== 'drafted' || ctx.dryRun) return outcome;
  const proposalId = await deps.saveProposal({ runId: ctx.runId, cluster, venue, proposal: outcome.proposal });
  await deps.notify(venue.ownerId, 'proposal_received', { proposalId, title: outcome.proposal.title, demandBand: cluster.band });
  await deps.logActions([{ userId: null, actor: 'planning_agent', action: 'generate_proposal', permissionsUsed: ['demand'], result: outcome.proposal.title }]);
  return { kind: 'created', proposalId, venue, proposal: outcome.proposal };
}
