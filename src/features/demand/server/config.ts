/** Pipeline tuning (spec §5). The only place to change thresholds. */
export const DEMAND_CONFIG = {
  minCohortSize: Number(process.env.MIN_COHORT_SIZE ?? 4),
  geocellDegrees: 0.02,
  maxClustersPerRun: 10,
  maxProposalsPerBusinessPerRun: 2,
  duplicateWindowDays: 14,
  minInterestTagCount: 2,
  venueRadiusKm: 3,
  budgetHeadroom: 1.5,
  minDaysOut: 5,
  /** Ids per `.in()` read: the local gateway rejects URLs above about 200 uuids (414). */
  idBatchSize: 100,
  /** Rows per page when listing eligible users; PostgREST caps responses at `max_rows` (1000). */
  pageSize: 1000,
} as const;

export type DemandConfig = {
  readonly [K in keyof typeof DEMAND_CONFIG]: number;
};
