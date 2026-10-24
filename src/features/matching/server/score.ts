import { AVAILABILITY_SLOT, GROUP_SIZE_PREF, type AvailabilitySlot, type GroupSizePref } from '@/shared/enums';
import type { CompatibilityResult, SharablePreferences } from '@/shared/types';
import { resolveCategories } from './categories';
import { haversineKm, toLatLng } from './geo';
import { clamp01, intersect, jaccard, normalizeTags, weightedJaccard } from './similarity';
import {
  BUDGET_WEIGHTS,
  CATEGORY_WEIGHT,
  GROUP_SIZE_PROXIMITY,
  MATCH_WEIGHTS,
  SOCIAL_WEIGHTS,
} from './weights';

/**
 * The preferences the scorer works on: the shared contract, which carries `interestCategories`
 * (README §4). If a producer leaves them out at runtime they are derived from the interest tags.
 */
export type MatchingPreferences = SharablePreferences;

/** Context the pure scorer cannot know on its own. Both default to "fine". */
export type ScoreContext = { blocked?: boolean; discoverable?: boolean };

export type HardFilter = CompatibilityResult['hardFilterFailed'];

type Similarity<T> = { value: number; shared: T[] };

/** Interest Jaccard over tags ∪ categories, categories weighted at 0.5 (spec §5). */
export function interestSimilarity(a: MatchingPreferences, b: MatchingPreferences): Similarity<string> {
  const tagsA = normalizeTags(a.interests);
  const tagsB = normalizeTags(b.interests);
  const catsA = resolveCategories(a.interests, a.interestCategories);
  const catsB = resolveCategories(b.interests, b.interestCategories);
  const weighted = (tags: string[], cats: string[]) =>
    new Map<string, number>([...tags.map((t) => [`tag:${t}`, 1] as const), ...cats.map((c) => [`cat:${c}`, CATEGORY_WEIGHT] as const)]);
  const value = weightedJaccard(weighted(tagsA, catsA), weighted(tagsB, catsB));
  return { value, shared: [...intersect(tagsA, tagsB), ...intersect<string>(catsA, catsB)] };
}

const slotOrder = (slots: readonly AvailabilitySlot[]) =>
  [...slots].sort((x, y) => AVAILABILITY_SLOT.indexOf(x) - AVAILABILITY_SLOT.indexOf(y));

/** |shared slots| / min(|a|, |b|); 0 if either is empty. */
export function availabilitySimilarity(a: SharablePreferences, b: SharablePreferences): Similarity<AvailabilitySlot> {
  const slotsA = [...new Set(a.availabilitySlots)];
  const slotsB = [...new Set(b.availabilitySlots)];
  if (slotsA.length === 0 || slotsB.length === 0) return { value: 0, shared: [] };
  const shared = slotOrder(intersect(slotsA, slotsB));
  return { value: shared.length / Math.min(slotsA.length, slotsB.length), shared };
}

/** Same bucket = 1, adjacent = 0.5, otherwise (or unknown) 0. */
export function groupSizeProximity(a: GroupSizePref | null, b: GroupSizePref | null): number {
  if (a === null || b === null) return GROUP_SIZE_PROXIMITY.other;
  const gap = Math.abs(GROUP_SIZE_PREF.indexOf(a) - GROUP_SIZE_PREF.indexOf(b));
  if (gap === 0) return GROUP_SIZE_PROXIMITY.same;
  return gap === 1 ? GROUP_SIZE_PROXIMITY.adjacent : GROUP_SIZE_PROXIMITY.other;
}

/** 0.6 × social-goal Jaccard + 0.4 × group-size proximity. */
export function socialSimilarity(a: SharablePreferences, b: SharablePreferences): number {
  return (
    SOCIAL_WEIGHTS.goals * jaccard(a.socialGoals, b.socialGoals) +
    SOCIAL_WEIGHTS.groupSize * groupSizeProximity(a.groupSizePref ?? null, b.groupSizePref ?? null)
  );
}

/** Distance between the two users' coarse locations, or null when either is unknown. */
export function distanceBetween(a: SharablePreferences, b: SharablePreferences): number | null {
  const pa = toLatLng(a.coarseLat, a.coarseLng);
  const pb = toLatLng(b.coarseLat, b.coarseLng);
  return pa && pb ? haversineKm(pa, pb) : null;
}

/** The pair may meet within the smaller of the two travel radii. */
export function pairRadiusKm(a: SharablePreferences, b: SharablePreferences): number {
  return Math.min(a.travelRadiusKm, b.travelRadiusKm);
}

/** 1 − distance / radius, clamped to [0, 1]; 0 when the distance is unknown. */
export function locationSimilarity(distanceKm: number | null, radiusKm: number): number {
  if (distanceKm === null || radiusKm <= 0) return 0;
  return clamp01(1 - distanceKm / radiusKm);
}

type Range = { min: number; max: number };

function budgetRange(p: SharablePreferences): Range | null {
  if (p.budgetMax === null || p.budgetMax === undefined) return null;
  const min = p.budgetMin ?? 0;
  return { min: Math.min(min, p.budgetMax), max: p.budgetMax };
}

/** Overlap of the two budget ranges over the narrower one; 1 if either budget is unknown. */
export function budgetOverlap(a: SharablePreferences, b: SharablePreferences): number {
  const ra = budgetRange(a);
  const rb = budgetRange(b);
  if (!ra || !rb) return 1;
  const overlap = Math.min(ra.max, rb.max) - Math.max(ra.min, rb.min);
  if (overlap < 0) return 0;
  const narrower = Math.min(ra.max - ra.min, rb.max - rb.min);
  return narrower === 0 ? 1 : clamp01(overlap / narrower);
}

/** 0.5 × budget overlap + 0.5 × activity-preference Jaccard. */
export function budgetActivitySimilarity(a: SharablePreferences, b: SharablePreferences): number {
  return (
    BUDGET_WEIGHTS.budget * budgetOverlap(a, b) +
    BUDGET_WEIGHTS.activity * jaccard(normalizeTags(a.activityPrefs), normalizeTags(b.activityPrefs))
  );
}

/** Hard filters are never compensated by score (spec §5). */
export function hardFilter(a: SharablePreferences, b: SharablePreferences, ctx: ScoreContext): HardFilter {
  if (ctx.blocked) return 'blocked';
  if (ctx.discoverable === false) return 'not_discoverable';
  const distance = distanceBetween(a, b);
  if (distance === null || distance > pairRadiusKm(a, b)) return 'distance';
  return null;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Deterministic compatibility between two users' sharable preferences (README §4 contract).
 * Score 0–100, rounded; breakdown values are each component's similarity in [0, 1]. When a hard
 * filter fails the score is 0 and `hardFilterFailed` says why.
 */
export function getCompatibilityScore(
  a: MatchingPreferences,
  b: MatchingPreferences,
  ctx: ScoreContext = {},
): CompatibilityResult {
  const interests = interestSimilarity(a, b);
  const availability = availabilitySimilarity(a, b);
  const components = {
    interests: interests.value,
    availability: availability.value,
    social: socialSimilarity(a, b),
    location: locationSimilarity(distanceBetween(a, b), pairRadiusKm(a, b)),
    budget: budgetActivitySimilarity(a, b),
  };
  const total = (Object.keys(MATCH_WEIGHTS) as Array<keyof typeof MATCH_WEIGHTS>).reduce(
    (sum, key) => sum + MATCH_WEIGHTS[key] * components[key],
    0,
  );
  const failed = hardFilter(a, b, ctx);
  return {
    score: failed ? 0 : Math.round(clamp01(total) * 100),
    breakdown: {
      interests: round2(components.interests),
      availability: round2(components.availability),
      social: round2(components.social),
      location: round2(components.location),
      budget: round2(components.budget),
    },
    sharedInterests: interests.shared,
    sharedSlots: availability.shared,
    hardFilterFailed: failed,
  };
}
