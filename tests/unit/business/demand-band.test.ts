import { describe, expect, it } from 'vitest';
import { AVAILABILITY_SLOT, EVENT_CATEGORY } from '@/shared/enums';
import {
  DEMAND_BANDS,
  MIN_COHORT_SIZE,
  bandFloor,
  toDemandBand,
} from '@/features/business/server/demand-band';
import { buildInsights, buildProposalDemand } from '@/features/business/server/dto';

describe('demand banding', () => {
  it('maps the spec ranges', () => {
    expect(toDemandBand(4)).toBe('4-5');
    expect(toDemandBand(5)).toBe('4-5');
    expect(toDemandBand(6)).toBe('6-9');
    expect(toDemandBand(9)).toBe('6-9');
    expect(toDemandBand(10)).toBe('10+');
    expect(toDemandBand(19)).toBe('10+');
    expect(toDemandBand(20)).toBe('20+');
    expect(toDemandBand(500)).toBe('20+');
  });

  it('refuses to band a cohort below the privacy threshold', () => {
    for (const count of [-1, 0, 1, 2, 3]) {
      expect(toDemandBand(count)).toBeNull();
    }
    expect(MIN_COHORT_SIZE).toBe(4);
  });

  it('never leaks the raw count through the band floor', () => {
    expect(bandFloor('4-5')).toBe(4);
    expect(bandFloor('6-9')).toBe(6);
    expect(bandFloor('10+')).toBe(10);
    expect(bandFloor('20+')).toBe(20);
  });

  it('only knows the four spec bands', () => {
    expect(DEMAND_BANDS).toEqual(['4-5', '6-9', '10+', '20+']);
  });
});

/**
 * Spec section 9, T-U6: a raw cohort count must never reach a business. Every DTO builder
 * is handed a distinctive count and the serialized result is searched for it.
 */
describe('no DTO carries a raw cohort count', () => {
  const RAW = 7919; // prime, unlikely to collide with ids, prices or timestamps

  it('buildProposalDemand emits a band and nothing countable', () => {
    const dto = buildProposalDemand({
      memberCount: RAW,
      neighborhoodLabel: 'Mission',
      topInterests: [
        { tag: 'pottery', count: RAW },
        { tag: 'coffee', count: RAW },
      ],
    });
    expect(dto).not.toBeNull();
    expect(dto?.band).toBe('20+');
    expect(JSON.stringify(dto)).not.toContain(String(RAW));
    expect(dto?.topInterests).toEqual(['pottery', 'coffee']);
  });

  it('buildProposalDemand drops a sub-threshold cluster entirely', () => {
    expect(
      buildProposalDemand({ memberCount: 3, neighborhoodLabel: 'Mission', topInterests: [] }),
    ).toBeNull();
  });

  it('buildInsights emits one banded cell per category x slot', () => {
    const dto = buildInsights({
      withinKm: 3,
      sinceDays: 30,
      clusters: [
        { category: 'creative', slot: 'thu_eve', memberCount: RAW },
        { category: 'games', slot: 'fri_eve', memberCount: 2 },
      ],
    });
    expect(dto.cells).toEqual([{ category: 'creative', slot: 'thu_eve', band: '20+' }]);
    expect(JSON.stringify(dto)).not.toContain(String(RAW));
  });

  it('merges clusters that share a category and slot before banding', () => {
    const dto = buildInsights({
      withinKm: 3,
      sinceDays: 30,
      clusters: [
        { category: 'creative', slot: 'thu_eve', memberCount: 4 },
        { category: 'creative', slot: 'thu_eve', memberCount: 4 },
      ],
    });
    expect(dto.cells).toEqual([{ category: 'creative', slot: 'thu_eve', band: '6-9' }]);
  });

  it('never emits a cell outside the shared enums', () => {
    const dto = buildInsights({
      withinKm: 3,
      sinceDays: 30,
      clusters: EVENT_CATEGORY.flatMap((category) =>
        AVAILABILITY_SLOT.map((slot) => ({ category, slot, memberCount: 11 })),
      ),
    });
    expect(dto.cells).toHaveLength(EVENT_CATEGORY.length * AVAILABILITY_SLOT.length);
    for (const cell of dto.cells) {
      expect(EVENT_CATEGORY).toContain(cell.category);
      expect(AVAILABILITY_SLOT).toContain(cell.slot);
      expect(DEMAND_BANDS).toContain(cell.band);
    }
  });
});
