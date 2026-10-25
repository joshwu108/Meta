import { describe, expect, it } from 'vitest';
import { boundingBox, centroid, haversineKm, toLatLng } from '@/features/matching/server/geo';
import { categoriesFromTags, resolveCategories } from '@/features/matching/server/categories';
import { getCompatibilityScore, hardFilter, pairRadiusKm, type MatchingPreferences } from '@/features/matching/server/score';
import { intersect, jaccard, normalizeTag, normalizeTags, weightedJaccard } from '@/features/matching/server/similarity';

function prefs(overrides: Partial<MatchingPreferences> = {}): MatchingPreferences {
  return {
    userId: 'u',
    interests: ['pottery'],
    interestCategories: ['creative'],
    availabilitySlots: ['thu_eve'],
    socialGoals: ['make_friends'],
    groupSizePref: 'small',
    budgetMin: null,
    budgetMax: null,
    travelRadiusKm: 5,
    activityPrefs: [],
    coarseLat: 37.76,
    coarseLng: -122.42,
    neighborhood: 'Mission District',
    ...overrides,
  };
}

describe('haversineKm', () => {
  it('is 0 for the same point', () => {
    expect(haversineKm({ lat: 37.76, lng: -122.42 }, { lat: 37.76, lng: -122.42 })).toBe(0);
  });

  it('matches known distances', () => {
    // Mission (37.76,-122.42) → Hayes Valley (37.78,-122.42): 0.02° of latitude ≈ 2.22 km
    expect(haversineKm({ lat: 37.76, lng: -122.42 }, { lat: 37.78, lng: -122.42 })).toBeCloseTo(2.224, 2);
    // San Francisco → Los Angeles ≈ 559 km
    expect(haversineKm({ lat: 37.7749, lng: -122.4194 }, { lat: 34.0522, lng: -118.2437 })).toBeCloseTo(559.1, 0);
  });

  it('is symmetric', () => {
    const a = { lat: 37.75, lng: -122.43 };
    const b = { lat: 37.78, lng: -122.4 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 12);
  });
});

describe('geo helpers', () => {
  it('toLatLng rejects missing or non-finite coordinates', () => {
    expect(toLatLng(null, 1)).toBeNull();
    expect(toLatLng(1, undefined)).toBeNull();
    expect(toLatLng(Number.NaN, 1)).toBeNull();
    expect(toLatLng(37.76, -122.42)).toEqual({ lat: 37.76, lng: -122.42 });
  });

  it('boundingBox contains points within the radius', () => {
    const center = { lat: 37.76, lng: -122.42 };
    const box = boundingBox(center, 5);
    const east = { lat: 37.76, lng: -122.42 + 0.05 }; // ~4.4 km east
    expect(haversineKm(center, east)).toBeLessThan(5);
    expect(east.lng).toBeLessThanOrEqual(box.maxLng);
    expect(box.minLat).toBeLessThan(center.lat);
  });

  it('centroid averages and rounds to 2 dp', () => {
    expect(centroid([])).toBeNull();
    expect(centroid([{ lat: 37.76, lng: -122.42 }, { lat: 37.78, lng: -122.44 }])).toEqual({ lat: 37.77, lng: -122.43 });
    expect(centroid([{ lat: 37.751, lng: -122.4 }, { lat: 37.762, lng: -122.4 }, { lat: 37.77, lng: -122.4 }])).toEqual({ lat: 37.76, lng: -122.4 });
  });
});

describe('hard filters', () => {
  it('fails on distance beyond the smaller travel radius', () => {
    const a = prefs({ travelRadiusKm: 2 });
    const b = prefs({ coarseLat: 37.78, travelRadiusKm: 10 }); // ~2.2 km away
    expect(pairRadiusKm(a, b)).toBe(2);
    expect(hardFilter(a, b, {})).toBe('distance');
    expect(hardFilter(a, prefs({ coarseLat: 37.77 }), {})).toBeNull();
  });

  it('fails when either location is unknown', () => {
    expect(hardFilter(prefs(), prefs({ coarseLat: null }), {})).toBe('distance');
  });

  it('reports blocks and non-discoverable candidates before distance', () => {
    const far = prefs({ coarseLat: 40 });
    expect(hardFilter(prefs(), far, { blocked: true })).toBe('blocked');
    expect(hardFilter(prefs(), far, { discoverable: false })).toBe('not_discoverable');
  });

  it('a failed hard filter is never compensated by score', () => {
    const result = getCompatibilityScore(prefs(), prefs({ userId: 'b' }), { blocked: true });
    expect(result.hardFilterFailed).toBe('blocked');
    expect(result.score).toBe(0);
    expect(result.breakdown.interests).toBe(1);
  });
});

describe('similarity helpers', () => {
  it('normalizes tags to lowercase kebab', () => {
    expect(normalizeTag('  Board Games ')).toBe('board-games');
    expect(normalizeTag('live_music!')).toBe('live-music');
    expect(normalizeTags(['Coffee', 'coffee', '', '  '])).toEqual(['coffee']);
  });

  it('jaccard and intersect', () => {
    expect(jaccard(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3, 10);
    expect(jaccard([], [])).toBe(0);
    expect(intersect(['b', 'a', 'b'], ['a', 'b'])).toEqual(['b', 'a']);
  });

  it('weightedJaccard', () => {
    const a = new Map([['x', 1], ['c', 0.5]]);
    const b = new Map([['c', 0.5]]);
    expect(weightedJaccard(a, b)).toBeCloseTo(0.5 / 1.5, 10);
    expect(weightedJaccard(new Map(), new Map())).toBe(0);
  });

  it('derives categories from tags', () => {
    expect(categoriesFromTags(['Pottery', 'board games', 'coffee', 'unknown'])).toEqual(['creative', 'games', 'food_drink']);
    expect(categoriesFromTags(['music', 'food-drink'])).toEqual(['music', 'food_drink']);
    expect(resolveCategories(['pottery'], [])).toEqual([]);
    expect(resolveCategories(['pottery'], undefined)).toEqual(['creative']);
  });
});
