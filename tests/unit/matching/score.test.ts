import { describe, expect, it } from 'vitest';
import {
  availabilitySimilarity,
  budgetActivitySimilarity,
  budgetOverlap,
  getCompatibilityScore,
  groupSizeProximity,
  interestSimilarity,
  locationSimilarity,
  socialSimilarity,
  type MatchingPreferences,
} from '@/features/matching/server/score';
import { MATCH_WEIGHTS } from '@/features/matching/server/weights';

function prefs(overrides: Partial<MatchingPreferences> = {}): MatchingPreferences {
  return {
    userId: 'a',
    interests: ['pottery', 'coffee'],
    interestCategories: ['creative', 'food_drink'],
    availabilitySlots: ['thu_eve', 'sat_day'],
    socialGoals: ['make_friends', 'learn_skill'],
    groupSizePref: 'small',
    budgetMin: 0,
    budgetMax: 2500,
    travelRadiusKm: 5,
    activityPrefs: ['beginner-friendly', 'hands-on'],
    coarseLat: 37.76,
    coarseLng: -122.42,
    neighborhood: 'Mission District',
    ...overrides,
  };
}

const disjoint = prefs({
  userId: 'b',
  interests: ['board-games', 'trivia'],
  interestCategories: ['games'],
  availabilitySlots: ['mon_eve'],
  socialGoals: ['network'],
  groupSizePref: 'large',
  budgetMin: 5000,
  budgetMax: 9000,
  activityPrefs: ['competitive'],
  coarseLat: 37.9,
  coarseLng: -122.2,
  travelRadiusKm: 25,
});

describe('weights', () => {
  it('sum to exactly 1 so a perfect pair scores 100', () => {
    const total = Object.values(MATCH_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
    expect(total).toBeCloseTo(1, 10);
  });
});

describe('getCompatibilityScore golden values', () => {
  it('scores identical users 100 with every component at 1', () => {
    const result = getCompatibilityScore(prefs(), prefs({ userId: 'b' }));
    expect(result.score).toBe(100);
    expect(result.breakdown).toEqual({ interests: 1, availability: 1, social: 1, location: 1, budget: 1 });
    expect(result.hardFilterFailed).toBeNull();
    expect(result.sharedInterests).toEqual(['pottery', 'coffee', 'creative', 'food_drink']);
    expect(result.sharedSlots).toEqual(['thu_eve', 'sat_day']);
  });

  it('scores fully disjoint users 0', () => {
    const result = getCompatibilityScore(prefs(), disjoint);
    expect(result.score).toBe(0);
    expect(result.breakdown).toEqual({ interests: 0, availability: 0, social: 0, location: 0, budget: 0 });
    expect(result.sharedInterests).toEqual([]);
    expect(result.sharedSlots).toEqual([]);
  });

  it('is symmetric', () => {
    const a = prefs();
    const b = prefs({ userId: 'b', interests: ['pottery', 'painting'], availabilitySlots: ['thu_eve'], groupSizePref: 'medium' });
    expect(getCompatibilityScore(a, b).score).toBe(getCompatibilityScore(b, a).score);
  });

  it('weights components by 35/25/20/10/10', () => {
    // Only availability matches fully; everything else is zero → 25.
    const a = prefs({ interests: ['x'], interestCategories: [], socialGoals: ['network'], groupSizePref: 'one_on_one', activityPrefs: ['a'], budgetMin: 0, budgetMax: 100 });
    const b = prefs({ userId: 'b', interests: ['y'], interestCategories: [], socialGoals: ['make_friends'], groupSizePref: 'large', activityPrefs: ['b'], budgetMin: 200, budgetMax: 300, coarseLat: 37.76, coarseLng: -122.42 });
    const result = getCompatibilityScore(a, b, {});
    expect(result.breakdown.availability).toBe(1);
    expect(result.breakdown.location).toBe(1);
    expect(result.score).toBe(35);
  });
});

describe('interestSimilarity', () => {
  it('counts category overlap at half weight', () => {
    const a = prefs({ interests: ['pottery'], interestCategories: ['creative'] });
    const b = prefs({ interests: ['painting'], interestCategories: ['creative'] });
    // shared: creative (0.5); union: pottery (1) + painting (1) + creative (0.5) = 2.5
    expect(interestSimilarity(a, b).value).toBeCloseTo(0.5 / 2.5, 10);
    expect(interestSimilarity(a, b).shared).toEqual(['creative']);
  });

  it('normalizes tags before comparing', () => {
    const a = prefs({ interests: ['Board Games', ' Coffee '], interestCategories: [] });
    const b = prefs({ interests: ['board-games', 'coffee'], interestCategories: [] });
    expect(interestSimilarity(a, b).value).toBe(1);
    expect(interestSimilarity(a, b).shared).toEqual(['board-games', 'coffee']);
  });

  it('derives categories from tags when the contract omits them', () => {
    const a = prefs({ interests: ['pottery'], interestCategories: undefined });
    const b = prefs({ interests: ['ceramics'], interestCategories: undefined });
    expect(interestSimilarity(a, b).shared).toEqual(['creative']);
  });

  it('is 0 when both sides are empty', () => {
    const empty = prefs({ interests: [], interestCategories: [] });
    expect(interestSimilarity(empty, empty).value).toBe(0);
  });
});

describe('availabilitySimilarity', () => {
  it('divides shared slots by the smaller set', () => {
    const a = prefs({ availabilitySlots: ['thu_eve'] });
    const b = prefs({ availabilitySlots: ['thu_eve', 'fri_eve', 'sat_day'] });
    expect(availabilitySimilarity(a, b)).toEqual({ value: 1, shared: ['thu_eve'] });
  });

  it('is 0 when either side is empty', () => {
    expect(availabilitySimilarity(prefs({ availabilitySlots: [] }), prefs()).value).toBe(0);
  });

  it('orders shared slots by the week', () => {
    const a = prefs({ availabilitySlots: ['sun_eve', 'mon_eve', 'thu_eve'] });
    const b = prefs({ availabilitySlots: ['thu_eve', 'sun_eve', 'mon_eve'] });
    expect(availabilitySimilarity(a, b).shared).toEqual(['mon_eve', 'thu_eve', 'sun_eve']);
  });
});

describe('groupSizeProximity', () => {
  it('is 1 for the same size, 0.5 for adjacent sizes, 0 otherwise', () => {
    expect(groupSizeProximity('small', 'small')).toBe(1);
    expect(groupSizeProximity('small', 'medium')).toBe(0.5);
    expect(groupSizeProximity('one_on_one', 'small')).toBe(0.5);
    expect(groupSizeProximity('small', 'large')).toBe(0);
    expect(groupSizeProximity(null, 'small')).toBe(0);
  });
});

describe('socialSimilarity', () => {
  it('blends goal Jaccard (0.6) with group-size proximity (0.4)', () => {
    const a = prefs({ socialGoals: ['make_friends', 'learn_skill'], groupSizePref: 'small' });
    const b = prefs({ socialGoals: ['make_friends'], groupSizePref: 'medium' });
    expect(socialSimilarity(a, b)).toBeCloseTo(0.6 * 0.5 + 0.4 * 0.5, 10);
  });
});

describe('locationSimilarity', () => {
  it('is 1 − distance / radius, clamped to [0, 1]', () => {
    expect(locationSimilarity(0, 5)).toBe(1);
    expect(locationSimilarity(2.5, 5)).toBe(0.5);
    expect(locationSimilarity(7, 5)).toBe(0);
    expect(locationSimilarity(null, 5)).toBe(0);
    expect(locationSimilarity(1, 0)).toBe(0);
  });
});

describe('budget and activity', () => {
  it('treats an unknown budget as fully compatible', () => {
    expect(budgetOverlap(prefs({ budgetMin: null, budgetMax: null }), prefs())).toBe(1);
  });

  it('divides overlap by the narrower range', () => {
    const a = prefs({ budgetMin: 0, budgetMax: 2000 });
    const b = prefs({ budgetMin: 1500, budgetMax: 3000 });
    expect(budgetOverlap(a, b)).toBeCloseTo(500 / 1500, 10);
  });

  it('reads a missing minimum as zero', () => {
    const a = prefs({ budgetMin: null, budgetMax: 2000 });
    const b = prefs({ budgetMin: null, budgetMax: 3000 });
    expect(budgetOverlap(a, b)).toBe(1);
  });

  it('handles a single-price budget', () => {
    expect(budgetOverlap(prefs({ budgetMin: 1000, budgetMax: 1000 }), prefs({ budgetMin: 0, budgetMax: 2000 }))).toBe(1);
    expect(budgetOverlap(prefs({ budgetMin: 3000, budgetMax: 3000 }), prefs({ budgetMin: 0, budgetMax: 2000 }))).toBe(0);
  });

  it('averages budget overlap and activity Jaccard', () => {
    const a = prefs({ activityPrefs: ['quiet', 'hands-on'] });
    const b = prefs({ activityPrefs: ['quiet'] });
    expect(budgetActivitySimilarity(a, b)).toBeCloseTo(0.5 * 1 + 0.5 * 0.5, 10);
  });
});
