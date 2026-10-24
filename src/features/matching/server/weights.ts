/**
 * Compatibility weights (specs/03-matching-and-groups/specs.md §5). This file is the only place
 * to tune matching. Component weights must sum to 1 so a perfect pair scores 100.
 */
export const MATCH_WEIGHTS = {
  interests: 0.35,
  availability: 0.25,
  social: 0.2,
  location: 0.1,
  budget: 0.1,
} as const;

/** Social component: social-goal Jaccard vs group-size proximity. */
export const SOCIAL_WEIGHTS = { goals: 0.6, groupSize: 0.4 } as const;

/** Budget & activity component: budget-range overlap vs activity-preference Jaccard. */
export const BUDGET_WEIGHTS = { budget: 0.5, activity: 0.5 } as const;

/** A shared interest category counts half as much as a shared interest tag. */
export const CATEGORY_WEIGHT = 0.5;

/** Group-size proximity by distance between `GROUP_SIZE_PREF` buckets. */
export const GROUP_SIZE_PROXIMITY = { same: 1, adjacent: 0.5, other: 0 } as const;

/** Candidate set and response limits for `GET /api/matches`. */
export const MATCH_LIMITS = {
  maxCandidates: 500,
  defaultLimit: 20,
  maxLimit: 50,
  cacheTtlMs: 5 * 60_000,
  explanationTtlMs: 24 * 60 * 60_000,
} as const;
