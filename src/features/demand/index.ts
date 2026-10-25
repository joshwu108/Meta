import 'server-only';
import type { OpportunityRunSummary } from '@/shared/types';
import { runPipeline, PipelineBusyError } from './server/pipeline';
import { supabaseDeps } from './server/wiring';

/**
 * Public surface of workstream 04 (README §4). Other features import only from here.
 */

/** Runs the demand → proposal pipeline once. Throws PipelineBusyError if a run is in progress. */
export async function runOpportunityPipeline(opts: { triggeredBy: 'manual' | 'cron'; dryRun?: boolean }): Promise<OpportunityRunSummary> {
  const { stats: _stats, outcomes: _outcomes, ...summary } = await runPipeline(supabaseDeps(), opts);
  return summary;
}

export { PipelineBusyError };
export { DEMAND_BANDS, ProposalDocument, type DemandBand, type StoredProposal } from './schemas';
