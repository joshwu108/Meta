import type { OpportunityRunSummary } from '@/shared/types';
import { EMPTY_STATS, type RunStats } from '../schemas';
import { thresholdAndRank, type AggregatedCluster } from './aggregate';
import type { DemandUser } from './categories';
import { clusterUsers, filterUsers } from './cluster';
import type { PipelineDeps, TriggeredBy } from './deps';
import { processCluster, type ClusterOutcome } from './process-cluster';

export type PipelineResult = OpportunityRunSummary & {
  stats: RunStats;
  outcomes: { signature: string; outcome: ClusterOutcome['kind']; title?: string; businessName?: string; proposalId?: string }[];
};

const STAT_FOR: Partial<Record<ClusterOutcome['kind'], keyof RunStats>> = {
  created: 'proposalsCreated',
  duplicate: 'skippedDuplicate',
  unmatched: 'unmatched',
  llm_failure: 'llmFailures',
  rejected: 'rejectedByValidator',
};

const bump = (stats: RunStats, key: keyof RunStats | undefined): RunStats => (key ? { ...stats, [key]: stats[key] + 1 } : stats);

/** Spec §5.1: consent-filtered preferences for every eligible user; one batched log insert. */
async function collect(deps: PipelineDeps): Promise<DemandUser[]> {
  const ids = await deps.listEligibleUserIds();
  const shared = [...(await deps.getSharableBatch(ids)).values()];
  await deps.logActions(shared.map((u) => ({
    userId: u.userId, actor: 'demand_engine', action: 'collect_signals', permissionsUsed: ['demand'], result: 'Counted your interests and availability in anonymous community demand',
  })));
  return shared;
}

async function processAll(clusters: readonly AggregatedCluster[], deps: PipelineDeps, runId: string, dryRun: boolean, initial: RunStats) {
  let stats = initial;
  let usedByBusiness = new Map<string, number>();
  const outcomes: PipelineResult['outcomes'] = [];
  for (const cluster of clusters) {
    const outcome = await processCluster(cluster, deps, { runId, dryRun, usedByBusiness });
    stats = bump(stats, STAT_FOR[outcome.kind]);
    const venue = 'venue' in outcome ? outcome.venue : undefined;
    if (venue) usedByBusiness = new Map(usedByBusiness).set(venue.match.businessId, (usedByBusiness.get(venue.match.businessId) ?? 0) + 1);
    outcomes.push({
      signature: cluster.signature,
      outcome: outcome.kind,
      title: 'proposal' in outcome ? outcome.proposal.title : undefined,
      businessName: venue?.card.name,
      proposalId: outcome.kind === 'created' ? outcome.proposalId : undefined,
    });
    await deps.updateRun(runId, { stats });
  }
  return { stats, outcomes };
}

async function execute(deps: PipelineDeps, runId: string, dryRun: boolean): Promise<{ stats: RunStats; outcomes: PipelineResult['outcomes'] }> {
  await deps.updateRun(runId, { stage: 'collecting' });
  const users = await collect(deps);
  await deps.updateRun(runId, { stage: 'clustering' });
  const { kept, suppressed } = thresholdAndRank(clusterUsers(filterUsers(users), deps.config), deps.config);
  const stats: RunStats = { ...EMPTY_STATS, usersConsidered: users.length, clustersFound: kept.length, clustersSuppressed: suppressed };
  await deps.updateRun(runId, { stage: 'matching', stats });
  await deps.updateRun(runId, { stage: 'drafting' });
  return processAll(kept, deps, runId, dryRun, stats);
}

export class PipelineBusyError extends Error {
  constructor() {
    super('Another opportunity run is in progress');
  }
}

/** Takes the run lock; throws PipelineBusyError when another run is in progress. */
export async function startRun(deps: PipelineDeps, triggeredBy: TriggeredBy): Promise<string> {
  const runId = await deps.startRun(triggeredBy);
  if (!runId) throw new PipelineBusyError();
  return runId;
}

/** Executes an already-started run to completion, recording failure on the run row. */
export async function executeRun(
  deps: PipelineDeps,
  runId: string,
  opts: { triggeredBy: TriggeredBy; dryRun?: boolean; startedAt?: string },
): Promise<PipelineResult> {
  const dryRun = opts.dryRun ?? false;
  const startedAt = opts.startedAt ?? deps.now().toISOString();
  try {
    const { stats, outcomes } = await execute(deps, runId, dryRun);
    await deps.updateRun(runId, { status: 'completed', stage: 'done', stats, finished: true });
    return {
      runId,
      triggeredBy: opts.triggeredBy === 'group' ? 'manual' : opts.triggeredBy,
      dryRun,
      clustersDetected: stats.clustersFound,
      proposalsCreated: stats.proposalsCreated,
      startedAt,
      finishedAt: deps.now().toISOString(),
      stats,
      outcomes,
    };
  } catch (error) {
    await deps.updateRun(runId, { status: 'failed', error: error instanceof Error ? error.message : 'unknown', finished: true });
    throw error;
  }
}

/**
 * README §4 contract. Runs collect → filter → cluster → threshold → match → generate → validate
 * → store → notify while holding the run lock. A failure in one cluster is recorded and skipped;
 * anything else marks the run failed and rethrows.
 */
export async function runPipeline(deps: PipelineDeps, opts: { triggeredBy: TriggeredBy; dryRun?: boolean }): Promise<PipelineResult> {
  const startedAt = deps.now().toISOString();
  const runId = await startRun(deps, opts.triggeredBy);
  return executeRun(deps, runId, { ...opts, startedAt });
}
