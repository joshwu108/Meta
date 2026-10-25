import { AVAILABILITY_SLOT, EVENT_CATEGORY } from '@/shared/enums';
import type { DemandBand, EventCategory, InsightCell } from '@/shared/types';

/**
 * Local interest as a category x slot matrix, for the desktop grid.
 *
 * Read as a list per category, comparing Thursday evening with Saturday daytime means
 * scrolling and holding bands in your head; as a grid it is one glance. The phone keeps the
 * list, because nine columns do not fit a phone — same data, two presentations.
 */

/** Weakest to strongest, so a row can report its peak. */
const BAND_ORDER: readonly DemandBand[] = ['4-5', '6-9', '10+', '20+'];

export type InsightsRow = {
  category: EventCategory;
  /** One entry per slot in `AVAILABILITY_SLOT` order; null where there is no range. */
  bands: ReadonlyArray<DemandBand | null>;
  /** The strongest band in the row, for ordering the busiest category first. */
  peak: DemandBand;
};

export function insightsMatrix(cells: readonly InsightCell[]): readonly InsightsRow[] {
  const rows: InsightsRow[] = [];

  // Product order, not first-seen order, so the grid reads the same whatever the query returns.
  for (const category of EVENT_CATEGORY) {
    const own = cells.filter((cell) => cell.category === category);
    // A category with no range at all is left out rather than drawn as an empty row.
    if (own.length === 0) continue;

    const bands = AVAILABILITY_SLOT.map(
      (slot) => own.find((cell) => cell.slot === slot)?.band ?? null,
    );
    const peak = own.reduce<DemandBand>(
      (strongest, cell) =>
        BAND_ORDER.indexOf(cell.band) > BAND_ORDER.indexOf(strongest) ? cell.band : strongest,
      own[0]!.band,
    );
    rows.push({ category, bands, peak });
  }

  return rows;
}
