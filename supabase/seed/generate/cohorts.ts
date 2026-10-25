import type { AvailabilitySlot, EventCategory } from '../../../src/shared/enums';

/**
 * Cohort planting. The demand pipeline buckets users by `(category, slot)` and then by geocell
 * (0.02 degrees, roughly 2.2km), merging adjacent cells only while every member can still reach
 * the cluster centroid within their own travel radius. A cluster must reach `MIN_COHORT_SIZE`
 * (4) and its top interests need at least `minInterestTagCount` (2) occurrences, and a proposal
 * additionally needs the centroid within `venueRadiusKm` (3) of the venue.
 *
 * Random interests spread over 8 categories x 9 slots x geography essentially never satisfy all
 * of that at once, which is why the current 15-row seed yields zero clusters. So cohorts are
 * planted deliberately: each one pins a category, a slot, a tight geographic centre and a shared
 * core of interest tags.
 */

/** Interest tags per category, matching `TAG_CATEGORY` in the demand pipeline so derivation agrees. */
export const CATEGORY_TAGS: Readonly<Record<EventCategory, readonly string[]>> = {
  creative: ['pottery', 'ceramics', 'painting', 'watercolor', 'drawing', 'zines', 'photography', 'woodworking', 'crafts'],
  food_drink: ['coffee', 'coffee-shops', 'cooking', 'baking', 'wine', 'tea', 'fermentation', 'brunch'],
  games: ['board-games', 'tabletop', 'trivia', 'catan', 'chess', 'video-games'],
  outdoors: ['hiking', 'climbing', 'gardening', 'picnics', 'cycling'],
  fitness: ['running', 'yoga', 'dance', 'fitness'],
  learning: ['languages', 'books', 'book-club', 'coding', 'history'],
  music: ['live-music', 'music', 'jazz', 'karaoke', 'vinyl'],
  community: ['volunteering', 'community-garden', 'meetups'],
};

/** Neighbourhood centres. The first three sit on the seeded venues so proposals can fire. */
export const NEIGHBORHOODS: readonly { name: string; lat: number; lng: number }[] = [
  { name: 'Mission District', lat: 37.75, lng: -122.42 }, // Kiln & Cup (creative)
  { name: 'Hayes Valley', lat: 37.78, lng: -122.42 }, // Ritual Grounds (food_drink)
  { name: 'SoMa', lat: 37.78, lng: -122.4 }, // Meeple House (games)
  { name: 'Noe Valley', lat: 37.7502, lng: -122.4337 },
  { name: 'Potrero Hill', lat: 37.7605, lng: -122.4006 },
  { name: 'Inner Sunset', lat: 37.7601, lng: -122.4686 },
];

export type CohortPlan = {
  /** Stable key used to derive member emails, so a reseed produces the same people. */
  key: string;
  category: EventCategory;
  slot: AvailabilitySlot;
  neighborhood: string;
  lat: number;
  lng: number;
  /** Tags every member holds, so the cluster's top interests clear `minInterestTagCount`. */
  coreTags: readonly string[];
  size: number;
};

/**
 * Cohorts that must produce a proposal: each is parked on a seeded venue's category, a slot the
 * venue hosts, and its own coordinates, comfortably above the minimum size.
 */
const VENUE_COHORTS: readonly Omit<CohortPlan, 'key'>[] = [
  { category: 'creative', slot: 'thu_eve', neighborhood: 'Mission District', lat: 37.75, lng: -122.42, coreTags: ['pottery', 'ceramics'], size: 11 },
  { category: 'creative', slot: 'sat_day', neighborhood: 'Mission District', lat: 37.75, lng: -122.42, coreTags: ['painting', 'crafts'], size: 7 },
  { category: 'food_drink', slot: 'sat_day', neighborhood: 'Hayes Valley', lat: 37.78, lng: -122.42, coreTags: ['coffee', 'baking'], size: 9 },
  { category: 'food_drink', slot: 'wed_eve', neighborhood: 'Hayes Valley', lat: 37.78, lng: -122.42, coreTags: ['wine', 'cooking'], size: 6 },
  { category: 'games', slot: 'fri_eve', neighborhood: 'SoMa', lat: 37.78, lng: -122.4, coreTags: ['board-games', 'catan'], size: 12 },
  { category: 'games', slot: 'tue_eve', neighborhood: 'SoMa', lat: 37.78, lng: -122.4, coreTags: ['trivia', 'board-games'], size: 5 },
];

/** Breadth cohorts: the remaining categories and neighbourhoods, so the app is not all pottery. */
const BREADTH_COHORTS: readonly Omit<CohortPlan, 'key'>[] = [
  { category: 'outdoors', slot: 'sat_day', neighborhood: 'Potrero Hill', lat: 37.7605, lng: -122.4006, coreTags: ['hiking', 'picnics'], size: 8 },
  { category: 'outdoors', slot: 'sun_day', neighborhood: 'Inner Sunset', lat: 37.7601, lng: -122.4686, coreTags: ['cycling', 'gardening'], size: 6 },
  { category: 'fitness', slot: 'mon_eve', neighborhood: 'Noe Valley', lat: 37.7502, lng: -122.4337, coreTags: ['yoga', 'running'], size: 7 },
  { category: 'learning', slot: 'tue_eve', neighborhood: 'Noe Valley', lat: 37.7502, lng: -122.4337, coreTags: ['book-club', 'books'], size: 9 },
  { category: 'learning', slot: 'thu_eve', neighborhood: 'Potrero Hill', lat: 37.7605, lng: -122.4006, coreTags: ['coding', 'languages'], size: 5 },
  { category: 'music', slot: 'fri_eve', neighborhood: 'Mission District', lat: 37.75, lng: -122.42, coreTags: ['live-music', 'vinyl'], size: 10 },
  { category: 'music', slot: 'sat_eve', neighborhood: 'SoMa', lat: 37.78, lng: -122.4, coreTags: ['jazz', 'karaoke'], size: 6 },
  { category: 'community', slot: 'sun_day', neighborhood: 'Inner Sunset', lat: 37.7601, lng: -122.4686, coreTags: ['volunteering', 'community-garden'], size: 8 },
  { category: 'community', slot: 'wed_eve', neighborhood: 'Potrero Hill', lat: 37.7605, lng: -122.4006, coreTags: ['meetups', 'volunteering'], size: 5 },
];

/**
 * Every planted cohort, largest first so the most important ones are generated even when
 * `SEED_SCALE` is small. Sizes sum to roughly 120 cohort members; the remaining budget becomes
 * unaffiliated people who add realistic noise without breaking any cluster.
 */
export function cohortPlans(): CohortPlan[] {
  return [...VENUE_COHORTS, ...BREADTH_COHORTS].map((plan, index) => ({
    ...plan,
    key: `${plan.category}-${plan.slot}-${index}`,
  }));
}

/** Members needed to realise every planted cohort. */
export function plannedMemberCount(plans: readonly CohortPlan[] = cohortPlans()): number {
  return plans.reduce((total, plan) => total + plan.size, 0);
}
