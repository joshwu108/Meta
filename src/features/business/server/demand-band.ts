import 'server-only';
import type { DemandBand } from '@/shared/types';

/**
 * Privacy invariant 5 in specs/README.md section 3: a cohort smaller than this is never
 * shown to a business at all, not even as a band.
 */
export const MIN_COHORT_SIZE = Number(process.env.MIN_COHORT_SIZE ?? 4);

/** The only shapes a cohort size may take on its way to a business (04 section 5.5). */
export const DEMAND_BANDS = ['4-5', '6-9', '10+', '20+'] as const satisfies readonly DemandBand[];

const BAND_FLOORS = { '4-5': 4, '6-9': 6, '10+': 10, '20+': 20 } as const satisfies Record<DemandBand, number>;

/**
 * Raw count -> band, or null when the cohort is below the privacy threshold.
 * This is the only function allowed to look at a raw `member_count`.
 */
export function toDemandBand(memberCount: number): DemandBand | null {
  if (!Number.isFinite(memberCount) || memberCount < MIN_COHORT_SIZE) return null;
  if (memberCount >= 20) return '20+';
  if (memberCount >= 10) return '10+';
  if (memberCount >= 6) return '6-9';
  return '4-5';
}

/** The smallest cohort a band can represent — for sorting bands, never for display. */
export const bandFloor = (band: DemandBand): number => BAND_FLOORS[band];
