import { AVAILABILITY_SLOT } from '@/shared/enums';
import type { DemandBand, InsightCell } from '@/shared/types';
import { CATEGORY_LABEL, SLOT_LABEL, SLOT_SHORT } from '../labels';
import { insightsMatrix } from './insights-matrix';

/**
 * Local interest as a grid, shown from 1280px up, the same breakpoint the events table uses
 * so "desktop density" means one thing. The per-category list stays the narrower
 * presentation; nine columns do not fit a phone.
 *
 * The band is always printed in the cell. Weight is carried by text and a background step,
 * never by colour alone — so the grid still reads for a colourblind owner, and no new
 * white-on-brand pairing is introduced (see the contrast report in PROGRESS.md).
 */

/*
 * Weight is carried by the background and the font weight; the text itself stays on the
 * high-contrast token. Brand-on-brand-soft measured 4.20:1 light and 3.40:1 dark, and
 * brand-on-brand-soft-2 only 2.63:1 dark — all under AA for 12px, which is the same failure
 * reported against the brand palette in PROGRESS.md. Measured after this change: every cell
 * clears 4.5:1 in both themes.
 */
const CELL_STYLE: Record<DemandBand, string> = {
  '4-5': 'bg-surface-2 text-text-2',
  '6-9': 'bg-brand-soft text-text',
  '10+': 'bg-brand-soft text-text font-semibold',
  '20+': 'bg-brand-soft-2 text-text font-bold',
};

export function InsightsGrid({ cells }: { cells: readonly InsightCell[] }) {
  const rows = insightsMatrix(cells);
  if (rows.length === 0) return null;

  return (
    <table className="w-full table-fixed border-collapse text-left">
      <caption className="sr-only">
        Estimated local interest by activity and time of week, as ranges of people.
      </caption>
      <thead>
        <tr>
          <th scope="col" className="w-[132px] px-2 py-2 text-[length:var(--text-sm)] font-semibold text-text-2">
            Activity
          </th>
          {AVAILABILITY_SLOT.map((slot) => (
            <th
              key={slot}
              scope="col"
              className="px-1 py-2 text-center text-[length:var(--text-xs)] font-semibold text-text-2"
            >
              <abbr title={SLOT_LABEL[slot]} className="no-underline">
                {SLOT_SHORT[slot]}
              </abbr>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.category} className="border-t border-border-subtle">
            <th scope="row" className="px-2 py-2 text-[length:var(--text-sm)] font-medium">
              {CATEGORY_LABEL[row.category]}
            </th>
            {row.bands.map((band, index) => {
              const slot = AVAILABILITY_SLOT[index]!;
              return (
                <td key={slot} className="px-1 py-2 text-center">
                  {band === null ? (
                    <span className="text-text-2" aria-label="no range yet">
                      –
                    </span>
                  ) : (
                    <span
                      className={`inline-flex min-w-[42px] justify-center rounded-sm px-1.5 py-1 text-[length:var(--text-xs)] ${CELL_STYLE[band]}`}
                    >
                      {band}
                    </span>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
