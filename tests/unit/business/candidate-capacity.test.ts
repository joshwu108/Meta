import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { acceptsCriteria, rankCandidates, scoreCandidate } = await import('@/features/business/server/candidates');
const { MIN_COHORT_SIZE } = await import('@/features/business/server/demand-band');

type Row = Parameters<typeof acceptsCriteria>[0];
type Criteria = Parameters<typeof acceptsCriteria>[1];

const row = (id: string, capacity: number, distanceKm = 1): Row =>
  ({
    business_id: id,
    name: id,
    category: 'games',
    neighborhood: 'SoMa',
    address: '1 Test St',
    description: '',
    image_url: null,
    hours: {},
    capacity,
    event_categories: ['games'],
    hosting_slots: ['fri_eve'],
    equipment_tags: [],
    formats: [],
    min_price_cents: null,
    max_price_cents: null,
    distance_km: distanceKm,
  }) as Row;

const criteria = (cohortSize: number): Criteria =>
  ({
    category: 'games',
    cohortSize,
    slot: 'fri_eve',
    centerLat: 37.77,
    centerLng: -122.41,
    radiusKm: 3,
    budgetMax: 3750,
  }) as Criteria;

describe('acceptsCriteria capacity rule', () => {
  it('accepts a venue smaller than the cohort', () => {
    // A cohort counts interested people, not attendees. Rejecting a 12-seat venue for a
    // 20-person cohort hid small venues from exactly the demand that should help them.
    expect(acceptsCriteria(row('small', 12), criteria(20))).toBe(true);
  });

  it('rejects a venue below the minimum cohort size', () => {
    expect(acceptsCriteria(row('tiny', MIN_COHORT_SIZE - 1), criteria(20))).toBe(false);
  });

  it('accepts a venue exactly at the floor', () => {
    expect(acceptsCriteria(row('floor', MIN_COHORT_SIZE), criteria(20))).toBe(true);
  });

  it('still rejects the wrong category and out-of-radius venues', () => {
    const wrongCategory = { ...row('x', 20), event_categories: ['creative'] } as Row;
    expect(acceptsCriteria(wrongCategory, criteria(10))).toBe(false);
    expect(acceptsCriteria(row('far', 20, 9), criteria(10))).toBe(false);
  });
});

describe('ranking keeps a snug venue competitive', () => {
  it('ranks a venue the cohort fills above a cavernous one', () => {
    // capacityFit = cohortSize / capacity, so a full room scores higher. With the old hard
    // filter the snug venue never reached the ranking at all.
    const ranked = rankCandidates([row('cavernous', 30, 1), row('snug', 20, 1)], criteria(20));
    expect(ranked.map((m) => m.businessId)).toEqual(['snug', 'cavernous']);
  });

  it('includes a smaller-than-cohort venue in the ranking', () => {
    const ranked = rankCandidates([row('big', 30, 1), row('small', 12, 1)], criteria(20));
    expect(ranked.map((m) => m.businessId)).toContain('small');
  });

  it('scores capacity fit at full marks once the cohort meets or exceeds capacity', () => {
    const full = scoreCandidate(row('small', 12, 0), criteria(20));
    const half = scoreCandidate(row('big', 40, 0), criteria(20));
    expect(full.score).toBeGreaterThan(half.score);
  });
});
