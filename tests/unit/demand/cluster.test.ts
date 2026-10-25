import { describe, expect, it } from 'vitest';
import { attendanceEstimate, thresholdAndRank, toBand, toBrief } from '@/features/demand/server/aggregate';
import { categoriesFor, type DemandUser } from '@/features/demand/server/categories';
import { clusterUsers, filterUsers } from '@/features/demand/server/cluster';
import { DEMAND_CONFIG } from '@/features/demand/server/config';
import { areNeighbors, cellId, toCell } from '@/features/demand/server/geo';
import { consentingUsers } from './harness';

function user(id: string, lat: number, lng: number, extra: Partial<DemandUser> = {}): DemandUser {
  return {
    userId: id, interests: ['pottery'], interestCategories: [], availabilitySlots: ['thu_eve'], socialGoals: [], groupSizePref: 'small',
    budgetMin: null, budgetMax: 2000, travelRadiusKm: 5, activityPrefs: [], coarseLat: lat, coarseLng: lng, neighborhood: 'Mission District',
    ...extra,
  };
}

const cfg = DEMAND_CONFIG;

describe('geocells', () => {
  it('buckets without float drift and labels by south-west corner', () => {
    expect(cellId(toCell(37.76, -122.42, 0.02), 0.02)).toBe('37.76,-122.42');
    expect(cellId(toCell(37.75, -122.43, 0.02), 0.02)).toBe('37.74,-122.44');
  });

  it('treats the 8 surrounding cells as neighbors', () => {
    const c = toCell(37.76, -122.42, 0.02);
    expect(areNeighbors(c, { row: c.row + 1, col: c.col - 1 })).toBe(true);
    expect(areNeighbors(c, c)).toBe(false);
    expect(areNeighbors(c, { row: c.row + 2, col: c.col })).toBe(false);
  });
});

describe('clusterUsers', () => {
  it('merges adjacent cells so Mission and Castro land together', () => {
    const users = filterUsers([user('a', 37.76, -122.42), user('b', 37.76, -122.42), user('c', 37.76, -122.44), user('d', 37.75, -122.43)]);
    const clusters = clusterUsers(users, cfg);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.members.map((m) => m.userId).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('does not merge when the centroid is outside someone\'s travel radius', () => {
    const users = filterUsers([user('a', 37.76, -122.42, { travelRadiusKm: 1 }), user('b', 37.78, -122.42, { travelRadiusKm: 1 })]);
    expect(clusterUsers(users, cfg)).toHaveLength(2);
  });

  it('puts each user in at most one cluster per (category, slot)', () => {
    const clusters = clusterUsers(filterUsers(consentingUsers()), cfg);
    expect(clusters.length).toBeGreaterThan(0);
    for (const c of clusters) {
      const others = clusters.filter((o) => o !== c && o.category === c.category && o.slot === c.slot);
      const ids = new Set(c.members.map((m) => m.userId));
      expect(others.every((o) => o.members.every((m) => !ids.has(m.userId)))).toBe(true);
    }
  });

  it('filters users without slots, categories or coordinates', () => {
    const kept = filterUsers([user('a', 37.76, -122.42, { availabilitySlots: [] }), user('b', 37.76, -122.42, { interests: ['unknown-tag'] }), user('c', 37.76, -122.42, { coarseLat: null })]);
    expect(kept).toEqual([]);
  });
});

describe('categoriesFor', () => {
  it('prefers explicit categories and derives from tags otherwise', () => {
    expect(categoriesFor(user('a', 0, 0, { interestCategories: ['music'] }))).toEqual(['music']);
    expect(categoriesFor(user('a', 0, 0, { interests: ['ceramics', 'coffee', 'board-games'] }))).toEqual(['creative', 'food_drink', 'games']);
  });
});

describe('thresholdAndRank', () => {
  it('suppresses a 3-person cohort and never keeps it', () => {
    const clusters = clusterUsers(filterUsers([user('a', 37.76, -122.42), user('b', 37.76, -122.42), user('c', 37.76, -122.42)]), cfg);
    const { kept, suppressed } = thresholdAndRank(clusters, cfg);
    expect(kept).toEqual([]);
    expect(suppressed).toBe(1);
  });

  it('only keeps interest tags held by at least two members', () => {
    const users = [user('a', 37.76, -122.42, { interests: ['pottery', 'jazz'] }), user('b', 37.76, -122.42), user('c', 37.76, -122.42), user('d', 37.76, -122.42)];
    const [cluster] = thresholdAndRank(clusterUsers(filterUsers(users), cfg), cfg).kept;
    expect(cluster?.topInterests).toEqual([{ tag: 'pottery', count: 4 }]);
  });

  it('finds the two Scene 3 cohorts with the right bands', () => {
    const { kept } = thresholdAndRank(clusterUsers(filterUsers(consentingUsers()), cfg), cfg);
    const creative = kept.find((c) => c.category === 'creative' && c.slot === 'thu_eve');
    const games = kept.find((c) => c.category === 'games' && c.slot === 'fri_eve');
    expect(creative?.memberCount).toBe(6);
    expect(creative?.band).toBe('6-9');
    expect(games?.band).toBe('4-5');
  });

  it('ranks by member count × share holding the top tag', () => {
    const { kept } = thresholdAndRank(clusterUsers(filterUsers(consentingUsers()), cfg), cfg);
    const scores = kept.map((c) => c.rankScore);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    const top = kept[0]!;
    expect(top.rankScore).toBe(top.topInterests[0]?.count ?? 0);
  });

  it('brief carries no ids, names or coordinates', () => {
    const { kept } = thresholdAndRank(clusterUsers(filterUsers(consentingUsers()), cfg), cfg);
    const text = JSON.stringify(kept.map(toBrief));
    expect(text).not.toMatch(/userId|00000000-|37\.\d|122\.\d|@/);
  });
});

describe('attendanceEstimate (P1)', () => {
  it('derives a range from the band, not the raw count, capped at capacity', () => {
    expect(attendanceEstimate('6-9', 10)).toEqual({ min: 3, max: 8, confidence: 'medium' });
    expect(attendanceEstimate('4-5', 10)).toEqual({ min: 2, max: 5, confidence: 'medium' });
    expect(attendanceEstimate('20+', 12)).toEqual({ min: 12, max: 12, confidence: 'low' });
  });

  it('is identical for every count inside a band', () => {
    const { kept } = thresholdAndRank(clusterUsers(filterUsers(consentingUsers()), cfg), cfg);
    const c = kept.find((k) => k.band === '6-9')!;
    expect(attendanceEstimate(c.band, 10)).toEqual(attendanceEstimate('6-9', 10));
  });
});

describe('toBand', () => {
  it.each([[4, '4-5'], [5, '4-5'], [6, '6-9'], [9, '6-9'], [10, '10+'], [19, '10+'], [20, '20+']] as const)('%i → %s', (n, band) => {
    expect(toBand(n)).toBe(band);
  });
});
