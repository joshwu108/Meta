import type { AvailabilitySlot } from './enums';

/** Short label for chips and pills: "thu_eve" → "Thu evening". */
export const SLOT_LABELS: Readonly<Record<AvailabilitySlot, string>> = {
  mon_eve: 'Mon evening',
  tue_eve: 'Tue evening',
  wed_eve: 'Wed evening',
  thu_eve: 'Thu evening',
  fri_eve: 'Fri evening',
  sat_day: 'Sat daytime',
  sat_eve: 'Sat evening',
  sun_day: 'Sun daytime',
  sun_eve: 'Sun evening',
};

/** Phrase for sentences: "thu_eve" → "Thursday evenings". */
export const SLOT_PHRASES: Readonly<Record<AvailabilitySlot, string>> = {
  mon_eve: 'Monday evenings',
  tue_eve: 'Tuesday evenings',
  wed_eve: 'Wednesday evenings',
  thu_eve: 'Thursday evenings',
  fri_eve: 'Friday evenings',
  sat_day: 'Saturday daytime',
  sat_eve: 'Saturday evenings',
  sun_day: 'Sunday daytime',
  sun_eve: 'Sunday evenings',
};

/** "board-games" → "board games" for display. */
export function interestLabel(tag: string): string {
  return tag.replace(/[-_]+/g, ' ');
}
