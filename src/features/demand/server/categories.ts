import { EVENT_CATEGORY, type EventCategory } from '@/shared/enums';
import type { SharablePreferences } from '@/shared/types';

/**
 * `SharablePreferences.interestCategories` (README §4) wins when it is non-empty. Users whose
 * list is empty (older rows, partial onboarding) fall back to categories derived from tags.
 */
const TAG_CATEGORY: Readonly<Record<string, EventCategory>> = {
  pottery: 'creative', ceramics: 'creative', painting: 'creative', watercolor: 'creative',
  drawing: 'creative', sketching: 'creative', illustration: 'creative', zines: 'creative',
  photography: 'creative', 'film-photography': 'creative', woodworking: 'creative', crafts: 'creative',
  coffee: 'food_drink', 'coffee-shops': 'food_drink', cooking: 'food_drink', baking: 'food_drink',
  wine: 'food_drink', tea: 'food_drink', fermentation: 'food_drink', brunch: 'food_drink',
  'board-games': 'games', 'tabletop': 'games', trivia: 'games', catan: 'games', chess: 'games', 'video-games': 'games',
  hiking: 'outdoors', climbing: 'outdoors', gardening: 'outdoors', picnics: 'outdoors', cycling: 'outdoors',
  running: 'fitness', yoga: 'fitness', dance: 'fitness', fitness: 'fitness',
  languages: 'learning', books: 'learning', 'book-club': 'learning', coding: 'learning', history: 'learning',
  'live-music': 'music', music: 'music', jazz: 'music', karaoke: 'music', vinyl: 'music',
  volunteering: 'community', 'community-garden': 'community', meetups: 'community',
};

export type DemandUser = SharablePreferences;

export function categoriesFor(user: DemandUser): EventCategory[] {
  const explicit = user.interestCategories.filter((c) => (EVENT_CATEGORY as readonly string[]).includes(c));
  const derived = explicit.length > 0 ? explicit : user.interests.flatMap((t) => TAG_CATEGORY[t] ?? []);
  return EVENT_CATEGORY.filter((c) => derived.includes(c));
}
