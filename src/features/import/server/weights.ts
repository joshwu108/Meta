/**
 * Every tunable constant for 07's deterministic confidence (the only place to change them).
 * The model never reports confidence; it is computed from where a label was seen.
 */

/** A topic listed on Your Algorithm, or set to "see more". */
export const W_TOPIC = 0.6;
/** Listed among the ad interests in a Download-your-information export (Phase 3). */
export const W_AD_INTEREST = 0.35;
/** The tag is mentioned in the Your Algorithm AI summary. */
export const W_SUMMARY = 0.3;
/** Per Explore tile showing the theme, capped below. */
export const W_EXPLORE_PER_TILE = 0.15;
export const W_EXPLORE_CAP = 0.45;
/** Multiplier when the model mapped the label as "close" rather than exact. */
export const CLOSE_FACTOR = 0.8;

export const MAX_CONFIDENCE = 0.95;
export const BAND_STRONG = 0.7;
export const BAND_SOME = 0.5;
export const BAND_WEAK = 0.3;

export const MAX_SUGGESTIONS_PER_RUN = 25;
export const MAX_LEFTOVERS_FOR_MODEL = 60;
export const MAX_EVIDENCE_LINES = 3;
export const MAX_RUNS_PER_DAY = 10;
export const SUGGESTION_TTL_DAYS = 30;
