import { z } from 'zod';
import { ApiError } from '@/lib/api/errors';
import { AVAILABILITY_SLOT, type AvailabilitySlot } from '@/shared/enums';
import type { ProposalDocument, StoredProposal } from '../schemas';
import { toBrief, type AggregatedCluster } from './aggregate';
import type { DemandConfig } from './config';
import type { GenerateInput } from './deps';
import { validateProposal } from './validate';
import { capabilitySummary, type Venue } from './venue';

export const ReviseRequest = z
  .object({
    note: z.string().trim().min(1).max(500).optional(),
    priceCents: z.number().int().min(0).max(100_000).optional(),
    capacity: z.number().int().min(4).max(60).optional(),
    slot: z.enum(AVAILABILITY_SLOT).optional(),
  })
  .strict()
  .refine((r) => Object.keys(r).length > 0, { message: 'Provide a note or at least one change' });
export type ReviseRequest = z.infer<typeof ReviseRequest>;

export type Revision = { at: string; request: ReviseRequest; proposal: StoredProposal };

export type StoredProposalRow = {
  id: string;
  status: string;
  business_id: string;
  proposal: StoredProposal;
  business_edits: { revisions?: Revision[] } & Record<string, unknown> | null;
  cluster: AggregatedCluster | null;
};

export type ReviseDeps = {
  config: Pick<DemandConfig, 'budgetHeadroom' | 'minDaysOut'>;
  now: () => Date;
  /** Loads the proposal only if the caller may see it (RLS-scoped read). */
  loadProposal: (id: string) => Promise<StoredProposalRow | null>;
  loadVenue: (businessId: string) => Promise<Venue | null>;
  generate: (input: GenerateInput & { revision: { current: StoredProposal; request: ReviseRequest } }) => Promise<ProposalDocument>;
  appendRevision: (id: string, revisions: readonly Revision[]) => Promise<void>;
};

const REVISABLE = new Set(['pending', 'modified']);

/** The owner's numbers always win over the model's, then the usual validator runs. */
function applyRequest(doc: ProposalDocument, request: ReviseRequest): ProposalDocument {
  return {
    ...doc,
    suggestedPriceCents: request.priceCents ?? doc.suggestedPriceCents,
    suggestedCapacity: request.capacity ?? doc.suggestedCapacity,
    suggestedSlot: request.slot ?? doc.suggestedSlot,
  };
}

/** P1 `POST /api/ai/proposals/:id/revise`: drafts a new version into `business_edits.revisions[]`. */
export async function reviseProposal(id: string, request: ReviseRequest, deps: ReviseDeps): Promise<{ proposalId: string; revision: StoredProposal; revisionCount: number }> {
  const row = await deps.loadProposal(id);
  if (!row) throw new ApiError('NOT_FOUND', 'Proposal not found', 404);
  if (!REVISABLE.has(row.status)) throw new ApiError('CONFLICT', `A ${row.status} proposal cannot be revised`, 409);
  if (!row.cluster) throw new ApiError('CONFLICT', 'This proposal has no demand cluster to revise against', 409);
  const venue = await deps.loadVenue(row.business_id);
  if (!venue) throw new ApiError('CONFLICT', 'The venue no longer accepts AI proposals', 409);

  const slot: AvailabilitySlot = request.slot ?? row.cluster.slot;
  const cluster = { ...row.cluster, slot };
  const previous = row.business_edits?.revisions ?? [];
  const current = previous.at(-1)?.proposal ?? row.proposal;
  const draft = await deps.generate({
    brief: toBrief(cluster), business: venue.card, capabilities: capabilitySummary(venue), revision: { current, request },
  });
  const result = validateProposal(applyRequest({ ...draft, category: cluster.category }, request), cluster, venue, deps.now(), deps.config);
  if (!result.ok) throw new ApiError('VALIDATION', 'The revision breaks the venue constraints', 400, { issues: result.issues });

  const revisions = [...previous, { at: deps.now().toISOString(), request, proposal: result.proposal }];
  await deps.appendRevision(id, revisions);
  return { proposalId: id, revision: result.proposal, revisionCount: revisions.length };
}
