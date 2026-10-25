import { EVENT_CATEGORY, type EventCategory } from '@/shared/enums';
import { normalizeTag } from './similarity';

/**
 * Fallback tag → category map. 02 stores `interest_categories`, but the shared
 * `SharablePreferences` contract does not carry them yet (see PROGRESS "Needs from others"), so
 * the scorer derives categories from interest tags when they are missing.
 */
const TAG_CATEGORIES: Readonly<Record<string, EventCategory>> = {
  pottery: 'creative',
  ceramics: 'creative',
  clay: 'creative',
  painting: 'creative',
  watercolor: 'creative',
  drawing: 'creative',
  sketching: 'creative',
  illustration: 'creative',
  zines: 'creative',
  crafts: 'creative',
  knitting: 'creative',
  photography: 'creative',
  'film-photography': 'creative',
  woodworking: 'creative',
  writing: 'creative',
  coffee: 'food_drink',
  'coffee-shops': 'food_drink',
  cooking: 'food_drink',
  baking: 'food_drink',
  wine: 'food_drink',
  'natural-wine': 'food_drink',
  tea: 'food_drink',
  fermentation: 'food_drink',
  'board-games': 'games',
  'tabletop': 'games',
  trivia: 'games',
  catan: 'games',
  chess: 'games',
  'video-games': 'games',
  hiking: 'outdoors',
  camping: 'outdoors',
  gardening: 'outdoors',
  cycling: 'fitness',
  running: 'fitness',
  yoga: 'fitness',
  climbing: 'fitness',
  'rock-climbing': 'fitness',
  languages: 'learning',
  'book-club': 'learning',
  reading: 'learning',
  'live-music': 'music',
  music: 'music',
  jazz: 'music',
  karaoke: 'music',
  volunteering: 'community',
  'book-swap': 'community',
};

const CATEGORY_SET: ReadonlySet<string> = new Set(EVENT_CATEGORY);

/** Categories implied by interest tags (tags that are category names count as themselves). */
export function categoriesFromTags(tags: readonly string[]): EventCategory[] {
  const found = tags
    .map(normalizeTag)
    .map((tag) => (CATEGORY_SET.has(tag.replace(/-/g, '_')) ? (tag.replace(/-/g, '_') as EventCategory) : TAG_CATEGORIES[tag]))
    .filter((category): category is EventCategory => category !== undefined);
  return [...new Set(found)];
}

/** Explicit categories when the caller provided them, otherwise ones derived from the tags. */
export function resolveCategories(interests: readonly string[], categories?: readonly EventCategory[]): EventCategory[] {
  if (categories !== undefined) return [...new Set(categories.filter((c) => CATEGORY_SET.has(c)))];
  return categoriesFromTags(interests);
}
