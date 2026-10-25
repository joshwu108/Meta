import type { AvailabilitySlot, EventCategory, EventStatus } from '@/shared/enums';
import type { DemandBand } from '@/shared/types';

/**
 * Human copy for the shared enums. Imported by both server modules (proposal reasons) and
 * client components (pills, chips), so this file stays free of `server-only`.
 */

export const SLOT_LABEL = {
  mon_eve: 'Monday evenings',
  tue_eve: 'Tuesday evenings',
  wed_eve: 'Wednesday evenings',
  thu_eve: 'Thursday evenings',
  fri_eve: 'Friday evenings',
  sat_day: 'Saturday daytime',
  sat_eve: 'Saturday evenings',
  sun_day: 'Sunday daytime',
  sun_eve: 'Sunday evenings',
} as const satisfies Record<AvailabilitySlot, string>;

/** Column headings for the desktop insights grid, where the full label will not fit. */
export const SLOT_SHORT = {
  mon_eve: 'Mon eve',
  tue_eve: 'Tue eve',
  wed_eve: 'Wed eve',
  thu_eve: 'Thu eve',
  fri_eve: 'Fri eve',
  sat_day: 'Sat day',
  sat_eve: 'Sat eve',
  sun_day: 'Sun day',
  sun_eve: 'Sun eve',
} as const satisfies Record<AvailabilitySlot, string>;

export const CATEGORY_LABEL = {
  creative: 'Creative',
  food_drink: 'Food & drink',
  games: 'Games',
  outdoors: 'Outdoors',
  fitness: 'Fitness',
  learning: 'Learning',
  music: 'Music',
  community: 'Community',
} as const satisfies Record<EventCategory, string>;

export const STATUS_LABEL = {
  proposed: 'Proposed',
  awaiting_approval: 'Awaiting your approval',
  approved_draft: 'Draft',
  published: 'Published',
  full: 'Full',
  completed: 'Completed',
  cancelled: 'Cancelled',
} as const satisfies Record<EventStatus, string>;

/** `StatusPill` tone per design-system.md section 4. */
export const STATUS_TONE = {
  proposed: 'neutral',
  awaiting_approval: 'warning',
  approved_draft: 'neutral',
  published: 'success',
  full: 'info',
  completed: 'neutral',
  cancelled: 'danger',
} as const satisfies Record<EventStatus, 'neutral' | 'info' | 'success' | 'warning' | 'danger'>;

/**
 * The only sentence shape a band may appear in. Never "6 people" — the number is an
 * opt-in aggregate estimate, not a list of attendees (spec section 12).
 */
export const BAND_LABEL = {
  '4-5': '4-5 people',
  '6-9': '6-9 people',
  '10+': '10 or more people',
  '20+': '20 or more people',
} as const satisfies Record<DemandBand, string>;

export const demandSentence = (
  band: DemandBand,
  category: EventCategory,
  slot: AvailabilitySlot,
): string =>
  `Estimated local interest: ${BAND_LABEL[band]} nearby interested in ${CATEGORY_LABEL[
    category
  ].toLowerCase()} activities on ${SLOT_LABEL[slot].toLowerCase()}`;
