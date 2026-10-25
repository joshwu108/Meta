import { EVENT_CATEGORY, type AvailabilitySlot, type EventCategory } from './enums';

/** Display labels for shared enums. Safe to import from client components. */

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

/** Short chip label per event category. */
export const CATEGORY_LABELS: Readonly<Record<EventCategory, string>> = {
  creative: 'Creative',
  food_drink: 'Food & drink',
  games: 'Games',
  outdoors: 'Outdoors',
  fitness: 'Fitness',
  learning: 'Learning',
  music: 'Music',
  community: 'Community',
};

/** Phrase per category for sentences ("You both like creative projects"). */
export const CATEGORY_PHRASES: Readonly<Record<EventCategory, string>> = {
  creative: 'creative projects',
  food_drink: 'food and drink',
  games: 'games',
  outdoors: 'the outdoors',
  fitness: 'staying active',
  learning: 'learning new things',
  music: 'music',
  community: 'community events',
};

export function isCategory(value: string): value is EventCategory {
  return (EVENT_CATEGORY as readonly string[]).includes(value);
}

/** Chip text for an interest: categories get their label, tags lose their dashes. */
export function sharedInterestLabel(value: string): string {
  return isCategory(value) ? CATEGORY_LABELS[value] : interestLabel(value);
}

/** Capitalized chip text: "board-games" → "Board games", "food_drink" → "Food & drink". */
export function chipLabel(value: string): string {
  const label = sharedInterestLabel(value);
  return label.charAt(0).toUpperCase() + label.slice(1);
}
