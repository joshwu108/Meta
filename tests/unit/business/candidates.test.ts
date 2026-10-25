import { describe, expect, it } from 'vitest';
import type { VenueCriteria } from '@/shared/types';
import {
  type CandidateRow,
  acceptsCriteria,
  findCandidateBusinesses,
  rankCandidates,
  scoreCandidate,
} from '@/features/business/server/candidates';

const criteria: VenueCriteria = {
  category: 'creative',
  cohortSize: 6,
  slot: 'thu_eve',
  centerLat: 37.76,
  centerLng: -122.42,
  radiusKm: 3,
  budgetMax: 3000,
};

const candidate = (over: Partial<CandidateRow> = {}): CandidateRow => ({
  business_id: 'b-kiln',
  name: 'Kiln & Cup',
  category: 'creative',
  neighborhood: 'Mission',
  address: '1 Valencia St',
  description: 'Pottery studio and coffee bar',
  image_url: null,
  hours: { thu: [['09:00', '21:00']] },
  capacity: 12,
  event_categories: ['creative', 'food_drink'],
  hosting_slots: ['thu_eve', 'sat_day'],
  equipment_tags: ['pottery-wheels', 'kiln'],
  formats: ['workshop'],
  min_price_cents: 1500,
  max_price_cents: 3500,
  distance_km: 0.4,
  ...over,
});

/** Spec section 9, T-U5: the prefilter and the ordering. */
describe('candidate prefilter', () => {
  it('accepts a venue that hosts the category, fits the cohort and is in range', () => {
    expect(acceptsCriteria(candidate(), criteria)).toBe(true);
  });

  it('rejects a venue that does not host the category', () => {
    expect(acceptsCriteria(candidate({ event_categories: ['games'] }), criteria)).toBe(false);
  });

  it('accepts a venue smaller than the cohort', () => {
    // Deliberate change of contract (migration 0701): capacity is a floor, not an exclusion.
    // A cohort counts interested people, not attendees; turnout is modelled separately and
    // capped at capacity. The old rule rejected capacity 5 against a cohort of 6, which hid
    // every venue smaller than its local demand. `capacityFit` ranks fit instead.
    expect(acceptsCriteria(candidate({ capacity: 5 }), criteria)).toBe(true);
  });

  it('rejects a venue below the minimum cohort size', () => {
    expect(acceptsCriteria(candidate({ capacity: 3 }), criteria)).toBe(false);
  });

  it('accepts a venue exactly the size of the cohort', () => {
    expect(acceptsCriteria(candidate({ capacity: 6 }), criteria)).toBe(true);
  });

  it('rejects a venue beyond the radius', () => {
    expect(acceptsCriteria(candidate({ distance_km: 3.1 }), criteria)).toBe(false);
  });
});

describe('candidate scoring', () => {
  it('scores a perfect venue above an imperfect one', () => {
    const best = scoreCandidate(candidate(), criteria);
    const worse = scoreCandidate(
      candidate({ business_id: 'b-far', name: 'Far Studio', distance_km: 2.9, hosting_slots: ['mon_eve'] }),
      criteria,
    );
    expect(best.score).toBeGreaterThan(worse.score);
  });

  it('keeps every score inside 0..1', () => {
    const rows = [
      candidate(),
      candidate({ distance_km: 3, hosting_slots: [], min_price_cents: null, max_price_cents: null }),
      candidate({ capacity: 500, distance_km: 0, min_price_cents: 9000, max_price_cents: 9500 }),
    ];
    for (const row of rows) {
      const match = scoreCandidate(row, criteria);
      expect(match.score).toBeGreaterThanOrEqual(0);
      expect(match.score).toBeLessThanOrEqual(1);
    }
  });

  it('rewards a tighter capacity fit', () => {
    const tight = scoreCandidate(candidate({ capacity: 8 }), criteria).score;
    const loose = scoreCandidate(candidate({ capacity: 120 }), criteria).score;
    expect(tight).toBeGreaterThan(loose);
  });

  it('rewards hosting the requested slot', () => {
    const open = scoreCandidate(candidate(), criteria).score;
    const closed = scoreCandidate(candidate({ hosting_slots: ['mon_eve'] }), criteria).score;
    expect(open - closed).toBeCloseTo(0.3, 5);
  });

  it('rewards being closer', () => {
    const near = scoreCandidate(candidate({ distance_km: 0 }), criteria).score;
    const far = scoreCandidate(candidate({ distance_km: 3 }), criteria).score;
    expect(near - far).toBeCloseTo(0.2, 5);
  });

  it('penalises a venue whose cheapest option is over the budget', () => {
    const inBudget = scoreCandidate(candidate({ min_price_cents: 1500, max_price_cents: 2500 }), criteria).score;
    const overBudget = scoreCandidate(candidate({ min_price_cents: 5000, max_price_cents: 9000 }), criteria).score;
    expect(inBudget - overBudget).toBeCloseTo(0.1, 5);
  });

  it('explains itself without naming a person or a raw count', () => {
    const match = scoreCandidate(candidate(), criteria);
    expect(match.reasons).toContain('Hosts creative events');
    expect(match.reasons).toContain('Capacity 12');
    expect(match.reasons).toContain('Open Thursday evenings');
    expect(match.reasons.join(' ')).not.toMatch(/\b6 (people|interested)\b/);
  });

  it('returns only the public identity of the venue', () => {
    expect(Object.keys(scoreCandidate(candidate(), criteria)).sort()).toEqual([
      'businessId',
      'name',
      'reasons',
      'score',
    ]);
  });
});

describe('candidate ranking', () => {
  it('drops rows that fail the prefilter', () => {
    const ranked = rankCandidates(
      [candidate(), candidate({ business_id: 'b-small', name: 'Tiny', capacity: 2 })],
      criteria,
    );
    expect(ranked.map((r) => r.businessId)).toEqual(['b-kiln']);
  });

  it('orders by score, then distance, then name', () => {
    const ranked = rankCandidates(
      [
        candidate({ business_id: 'b-c', name: 'C Studio', distance_km: 2.0 }),
        candidate({ business_id: 'b-a', name: 'A Studio', distance_km: 0.4 }),
        candidate({ business_id: 'b-b', name: 'B Studio', distance_km: 0.4 }),
      ],
      criteria,
    );
    expect(ranked.map((r) => r.businessId)).toEqual(['b-a', 'b-b', 'b-c']);
  });

  it('returns at most five matches', () => {
    const rows = Array.from({ length: 9 }, (_, i) =>
      candidate({ business_id: `b-${i}`, name: `Studio ${i}`, distance_km: i * 0.3 }),
    );
    expect(rankCandidates(rows, criteria)).toHaveLength(5);
  });

  it('returns an empty list when nothing fits', () => {
    expect(rankCandidates([candidate({ capacity: 1 })], criteria)).toEqual([]);
  });
});

describe('findCandidateBusinesses', () => {
  it('ranks whatever the injected source returns', async () => {
    const rows = [
      candidate({ business_id: 'b-near', name: 'Near', distance_km: 0.2 }),
      candidate({ business_id: 'b-far', name: 'Far', distance_km: 2.8 }),
      candidate({ business_id: 'b-tiny', name: 'Tiny', capacity: 2 }),
    ];
    const matches = await findCandidateBusinesses(criteria, async () => rows);
    expect(matches.map((m) => m.businessId)).toEqual(['b-near', 'b-far']);
  });

  it('passes the criteria straight through to the source', async () => {
    const seen: VenueCriteria[] = [];
    await findCandidateBusinesses(criteria, async (c) => {
      seen.push(c);
      return [];
    });
    expect(seen).toEqual([criteria]);
  });

  it('returns an empty list when nothing is nearby', async () => {
    expect(await findCandidateBusinesses(criteria, async () => [])).toEqual([]);
  });
});
