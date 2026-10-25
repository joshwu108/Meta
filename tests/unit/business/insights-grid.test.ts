import { describe, expect, it } from 'vitest';
import { AVAILABILITY_SLOT } from '@/shared/enums';
import type { InsightCell } from '@/shared/types';
import { insightsMatrix } from '@/features/business/components/insights-matrix';

/**
 * The desktop shape of local interest.
 *
 * As a list per category, comparing Thursday evening against Saturday daytime means
 * scrolling and holding numbers in your head. As a category x slot grid it is one glance —
 * which is the whole difference between a list and an analysis. The phone keeps the list.
 */

const cell = (category: InsightCell['category'], slot: InsightCell['slot'], band: InsightCell['band']): InsightCell =>
  ({ category, slot, band }) as InsightCell;

describe('insightsMatrix', () => {
  it('puts every slot in weekday order, with gaps where there is no range', () => {
    const matrix = insightsMatrix([cell('creative', 'thu_eve', '6-9')]);

    expect(matrix).toHaveLength(1);
    expect(matrix[0]?.category).toBe('creative');
    expect(matrix[0]?.bands).toHaveLength(AVAILABILITY_SLOT.length);
    expect(matrix[0]?.bands[AVAILABILITY_SLOT.indexOf('thu_eve')]).toBe('6-9');
    expect(matrix[0]?.bands[AVAILABILITY_SLOT.indexOf('mon_eve')]).toBeNull();
  });

  it('only includes categories that have a range, so the grid is not mostly empty', () => {
    const matrix = insightsMatrix([cell('games', 'fri_eve', '10+')]);

    expect(matrix.map((row) => row.category)).toEqual(['games']);
  });

  it('keeps categories in the product order rather than first-seen order', () => {
    const matrix = insightsMatrix([
      cell('music', 'sat_eve', '4-5'),
      cell('creative', 'thu_eve', '6-9'),
    ]);

    // 'creative' comes before 'music' in EVENT_CATEGORY, whatever order the rows arrive in.
    expect(matrix.map((row) => row.category)).toEqual(['creative', 'music']);
  });

  it('reports the strongest band per row, for sorting the busiest category first', () => {
    const matrix = insightsMatrix([
      cell('creative', 'thu_eve', '6-9'),
      cell('creative', 'sat_day', '20+'),
    ]);

    expect(matrix[0]?.peak).toBe('20+');
  });

  it('returns nothing at all when there is no interest to show', () => {
    expect(insightsMatrix([])).toEqual([]);
  });
});
