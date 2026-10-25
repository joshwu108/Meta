import { beforeEach, describe, expect, it } from 'vitest';
import type { ApiError } from '@/lib/api/errors';
import {
  INSIGHTS_RADIUS_KM,
  INSIGHTS_WINDOW_DAYS,
  getBusinessInsights,
} from '@/features/business/server/insights';
import { MemoryBusinessStore } from '../../support/memory-store';
import { testDeps, type TestDeps } from '../../support/fixtures';

/** Spec section 3 (P1) and section 10 criterion 3. */
describe('business insights', () => {
  let store: MemoryBusinessStore;
  let deps: TestDeps;
  let businessId: string;

  beforeEach(() => {
    store = new MemoryBusinessStore();
    businessId = store.seedBusiness({ owner_id: 'owner-1' }).business.id;
    deps = testDeps(store);
  });

  it('uses the radius and window from the spec', async () => {
    expect(INSIGHTS_RADIUS_KM).toBe(3);
    expect(INSIGHTS_WINDOW_DAYS).toBe(30);
    const insights = await getBusinessInsights(deps, businessId);
    expect(insights.withinKm).toBe(3);
    expect(insights.sinceDays).toBe(30);
  });

  it('bands every cell and drops sub-threshold cohorts', async () => {
    store.seedInsights([
      { category: 'creative', slot: 'thu_eve', member_count: 7 },
      { category: 'games', slot: 'fri_eve', member_count: 2 },
    ]);
    const insights = await getBusinessInsights(deps, businessId);
    expect(insights.cells).toEqual([{ category: 'creative', slot: 'thu_eve', band: '6-9' }]);
  });

  it('never serializes a raw count', async () => {
    store.seedInsights([{ category: 'creative', slot: 'thu_eve', member_count: 7919 }]);
    const insights = await getBusinessInsights(deps, businessId);
    expect(JSON.stringify(insights)).not.toContain('7919');
  });

  it('ignores a cluster whose category or slot is not a shared enum value', async () => {
    store.seedInsights([
      { category: 'astrology', slot: 'thu_eve', member_count: 12 },
      { category: 'creative', slot: 'thu_night', member_count: 12 },
      { category: 'creative', slot: 'thu_eve', member_count: 12 },
    ]);
    const insights = await getBusinessInsights(deps, businessId);
    expect(insights.cells).toEqual([{ category: 'creative', slot: 'thu_eve', band: '10+' }]);
  });

  it('returns no cells when workstream 04 has not landed its clusters', async () => {
    expect((await getBusinessInsights(deps, businessId)).cells).toEqual([]);
  });

  it('fails with NOT_FOUND for a business that does not exist', async () => {
    try {
      await getBusinessInsights(deps, 'biz-missing');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as ApiError).code).toBe('NOT_FOUND');
    }
  });
});
