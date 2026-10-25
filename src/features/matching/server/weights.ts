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

/**
 * The interests component is a blend of exact-tag Jaccard and semantic (embedding) similarity.
 * Jaccard keeps the majority share because it is precise and explainable -- a shared tag is a
 * fact. The semantic share exists to stop `pottery` vs `ceramics` scoring zero. Must sum to 1.
 */
export const INTEREST_BLEND = { lexical: 0.6, semantic: 0.4 } as const;

/**
 * Below these cosines a semantic signal is treated as unrelated, so weak similarity cannot
 * quietly inflate a score. The two levels need different floors because their distributions
 * differ sharply -- measured with all-MiniLM-L6-v2 over the seeded population:
 *
 *   tag pairs      median 0.24, max 0.82  (pottery~ceramics 0.66, pottery~running 0.17)
 *   profile pairs  median 0.59, p95 0.85  (mean-pooled prose is similar to all other prose)
 *
 * A single floor calibrated on tag pairs would sit *below* the profile median, so three
 * quarters of all pairs would collect a near-identical bonus and the component would stop
 * discriminating. Each floor is therefore set well above its own median.
 */
export const SEMANTIC_FLOOR = { tag: 0.45, profile: 0.7 } as const;

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
