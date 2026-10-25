import type { GroupSizePref } from '@/shared/enums';
import type { DemandBand, DemandBrief } from '../schemas';
import type { RawCluster } from './cluster';
import type { DemandConfig } from './config';

export type AggregatedCluster = RawCluster & {
  signature: string;
  memberCount: number;
  band: DemandBand;
  topInterests: { tag: string; count: number }[];
  groupSizeMode: GroupSizePref | null;
  budgetP50Cents: number | null;
  activityPrefs: string[];
  neighborhoodLabel: string;
  rankScore: number;
};

/** Spec §4 banding. Only call for counts at or above the minimum cohort size. */
export function toBand(count: number): DemandBand {
  if (count >= 20) return '20+';
  if (count >= 10) return '10+';
  if (count >= 6) return '6-9';
  return '4-5';
}

const BAND_BOUNDS: Readonly<Record<DemandBand, { min: number; max: number }>> = {
  '4-5': { min: 4, max: 5 },
  '6-9': { min: 6, max: 9 },
  '10+': { min: 10, max: 19 },
  '20+': { min: 20, max: 30 },
};

/** Share of interested people expected to come; stated interest over-predicts turnout. */
const TURNOUT = { low: 0.6, high: 0.9 } as const;

/**
 * P1 "likely N–M attendees", computed from the band bounds (never the raw count) and capped
 * at the proposal capacity. Open-ended bands are marked low confidence.
 */
export function attendanceEstimate(band: DemandBand, capacity: number): { min: number; max: number; confidence: 'low' | 'medium' } {
  const b = BAND_BOUNDS[band];
  const max = Math.min(capacity, Math.max(2, Math.round(b.max * TURNOUT.high)));
  const min = Math.min(max, Math.max(2, Math.floor(b.min * TURNOUT.low)));
  return { min, max, confidence: band === '10+' || band === '20+' ? 'low' : 'medium' };
}

/** Tally values, most frequent first, ties broken alphabetically for determinism. */
function tally(values: readonly string[]): { tag: string; count: number }[] {
  const counts = values.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map<string, number>());
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 1 ? sorted[mid] : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
  return Math.round(value as number);
}

export function aggregate(cluster: RawCluster, config: Pick<DemandConfig, 'minInterestTagCount'>): AggregatedCluster {
  const members = cluster.members;
  const floor = (t: { count: number }) => t.count >= config.minInterestTagCount;
  const topInterests = tally(members.flatMap((m) => m.interests)).filter(floor);
  const topCount = topInterests[0]?.count ?? 0;
  return {
    ...cluster,
    signature: `${cluster.category}|${cluster.slot}|${cluster.geocell}`,
    memberCount: members.length,
    band: toBand(members.length),
    topInterests,
    groupSizeMode: (tally(members.flatMap((m) => (m.groupSizePref ? [m.groupSizePref] : [])))[0]?.tag as GroupSizePref | undefined) ?? null,
    budgetP50Cents: median(members.flatMap((m) => (m.budgetMax == null ? [] : [m.budgetMax]))),
    activityPrefs: tally(members.flatMap((m) => m.activityPrefs)).filter(floor).map((t) => t.tag),
    neighborhoodLabel: tally(members.flatMap((m) => (m.neighborhood ? [m.neighborhood] : [])))[0]?.tag ?? 'Nearby',
    rankScore: members.length * (members.length === 0 ? 0 : topCount / members.length),
  };
}

/**
 * Spec §5.4: keep clusters at or above the cohort minimum, rank by size × interest focus,
 * keep the top `maxClustersPerRun`. Clusters below the minimum are only counted, never kept.
 */
export function thresholdAndRank(
  clusters: readonly RawCluster[],
  config: Pick<DemandConfig, 'minCohortSize' | 'minInterestTagCount' | 'maxClustersPerRun'>,
): { kept: AggregatedCluster[]; suppressed: number } {
  const eligible = clusters.filter((c) => c.members.length >= config.minCohortSize);
  const ranked = eligible
    .map((c) => aggregate(c, config))
    .sort((a, b) => b.rankScore - a.rankScore || b.memberCount - a.memberCount || a.signature.localeCompare(b.signature));
  return {
    kept: ranked.slice(0, config.maxClustersPerRun),
    suppressed: clusters.length - eligible.length + Math.max(0, ranked.length - config.maxClustersPerRun),
  };
}

/** Spec §5.5: the only cluster data that reaches the model. */
export function toBrief(cluster: AggregatedCluster): DemandBrief {
  return {
    category: cluster.category,
    slot: cluster.slot,
    neighborhoodLabel: cluster.neighborhoodLabel,
    demandBand: cluster.band,
    topInterests: cluster.topInterests.slice(0, 5),
    groupSizeMode: cluster.groupSizeMode,
    budgetP50Cents: cluster.budgetP50Cents,
    activityPrefs: cluster.activityPrefs,
  };
}
