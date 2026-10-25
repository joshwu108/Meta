import type { EventCategory } from '@/shared/enums';
import { normalizeTag } from '@/features/matching';

/**
 * The only values 07 may suggest. Interest tags follow 02's TagSchema (lowercase kebab) so 03 and
 * 04 compare like with like. Each line is `tag, ...aliases`. Sensitive topics are absent on
 * purpose (README §3, spec 07 §11.4); `sensitive.ts` still filters them in case a label slips in.
 */
const INTERESTS: Readonly<Record<EventCategory, readonly string[]>> = {
  creative: [
    'ceramics, ceramic, ceramic art, ceramicist',
    'pottery, potter, pottery wheel, pottery-wheels, wheel throwing, kiln, clay',
    'painting, painter, acrylic painting, oil painting',
    'watercolor, watercolour, watercolors',
    'drawing, sketching, sketch, sketchbook, illustration, illustrations',
    'zines, zine, zine making, self publishing',
    'crafts, crafting, diy, diy crafts, handmade',
    'knitting, knit, crochet, yarn',
    'embroidery, cross stitch, needlework',
    'sewing, fashion design, upcycling, thrifting, thrift flips',
    'photography, photographer, photo, photos',
    'film-photography, film photography, analog photography, 35mm',
    'woodworking, woodwork, carpentry',
    'writing, creative writing, poetry, poems',
    'calligraphy, hand lettering, lettering',
    'printmaking, screen printing, linocut, risograph',
    'jewelry-making, jewelry making, beading, beadwork',
    'candle-making, candle making, candles',
    'graphic-design, graphic design, design, typography',
    'interior-design, interior design, home decor, room makeover',
    'florals, floral design, flower arranging, ikebana',
    'film, films, filmmaking, cinema, indie film',
    'animation, anime art, stop motion',
    'street-art, street art, murals, graffiti',
    'art, art galleries, contemporary art, museums',
    'theater, theatre, improv, acting',
    'comedy, stand up, stand-up comedy',
  ],
  food_drink: [
    'coffee, coffee shops, coffee-shops, cafe, cafes, espresso, espresso-bar, latte, barista',
    'latte-art, latte art',
    'tea, matcha, tea ceremony, boba',
    'baking, bake, bread, sourdough, pastry, pastries',
    'cooking, cook, home cooking, recipes, meal prep',
    'ramen, noodles',
    'sushi, japanese food',
    'tacos, mexican food',
    'pizza',
    'dumplings, dim sum',
    'brunch',
    'street-food, street food, food trucks, night markets',
    'farmers-markets, farmers market, farmers markets',
    'fermentation, kombucha, kimchi, pickling',
    'vegan-food, vegan, vegan recipes, plant based',
    'chocolate, desserts, dessert, ice cream',
    'food-tours, food tour, food tours, foodie, food',
    'cheese, charcuterie',
    'spicy-food, spicy food, hot sauce',
    'grilling, bbq, barbecue',
  ],
  games: [
    'board-games, board game, board games, boardgames, board-game-library, tabletop, tabletop games',
    'card-games, card games, card game, poker night',
    'chess',
    'trivia, trivia night, quiz night, quizzes',
    'video-games, video games, gaming, gamer, esports',
    'puzzles, jigsaw puzzles, crosswords, sudoku',
    'dnd, d&d, dungeons and dragons, tabletop rpg, ttrpg',
    'escape-rooms, escape room, escape rooms',
    'mahjong',
    'retro-games, retro gaming, arcade, arcades, pinball',
    'catan, settlers of catan',
    'magic-the-gathering, magic the gathering, mtg',
    'lego, legos',
  ],
  outdoors: [
    'hiking, hike, hikes, trails, trail running, hiking trails',
    'camping, campfire, backpacking',
    'gardening, garden, plants, houseplants, plant care',
    'birdwatching, birding, birds',
    'beach, beaches, beach days',
    'kayaking, kayak, canoeing, paddleboarding, sup',
    'surfing, surf',
    'sailing',
    'picnics, picnic',
    'nature, national parks, wildlife',
    'stargazing, astronomy',
    'foraging, mushrooms, mushroom foraging',
    'fishing',
    'urban-exploring, city walks, walking tours, urban exploring',
  ],
  fitness: [
    'yoga, yogi, vinyasa',
    'running, runner, run club, marathon, 5k',
    'cycling, bike, biking, bikes, road cycling',
    'climbing, rock-climbing, rock climbing, bouldering',
    'pilates',
    'dance, dancing, dance classes, salsa, swing dancing',
    'swimming, swim',
    'tennis',
    'pickleball',
    'basketball, pickup basketball',
    'soccer, football, futbol',
    'volleyball, beach volleyball',
    'martial-arts, martial arts, boxing, jiu jitsu, karate',
    'skateboarding, skate, skating, roller skating',
    'weightlifting, strength training, gym, lifting',
    'ultimate-frisbee, ultimate frisbee, frisbee, disc golf',
    'skiing, snowboarding',
    'golf',
  ],
  learning: [
    'languages, language learning, learning languages, spanish, french, japanese',
    'book-club, book club, book clubs',
    'reading, books, bookstagram, booktok, novels',
    'history, history facts',
    'science, science facts, space',
    'philosophy',
    'coding, programming, software, tech',
    'ai, artificial intelligence, machine learning',
    'design-thinking, ux, ux design, product design',
    'architecture, buildings',
    'documentaries, documentary',
    'podcasts, podcast',
    'public-speaking, public speaking, toastmasters',
    'workshops, classes, lectures, talks',
    'chemistry, physics, math',
  ],
  music: [
    'live-music, live music, concerts, concert, gigs, music festivals, festivals',
    'music, songs',
    'jazz',
    'karaoke',
    'vinyl, record collecting, records, record stores',
    'indie-music, indie music, indie, indie rock',
    'hip-hop, hip hop, rap',
    'electronic-music, electronic music, edm, techno, house music',
    'classical-music, classical music, orchestra, opera',
    'guitar, guitarist',
    'piano, pianist, keyboard',
    'singing, choir, a cappella',
    'djing, dj, djs',
    'drumming, drums, drum circle',
    'songwriting, music production, producing',
    'k-pop, kpop',
    'open-mic, open mic, open mics',
  ],
  community: [
    'volunteering, volunteer, volunteer work, community service',
    'book-swap, book swap, book exchange',
    'mutual-aid, mutual aid, food bank',
    'neighborhood-events, neighborhood events, block party, street fair',
    'sustainability, zero waste, climate, recycling',
    'community-gardens, community garden, community gardens',
    'animal-shelters, animal shelter, animal rescue, dog fostering',
    'dogs, dog, puppies, dog park',
    'cats, cat, kittens',
    'mentoring, mentorship, tutoring',
    'meetups, meetup, networking',
    'clothing-swap, clothing swap, swap meets',
    'cleanups, beach cleanup, park cleanup',
    'local-history, local history, sf history',
    'travel, traveling, travel tips',
  ],
};

/**
 * Closed list of activity styles. The first three are the spellings 02 already writes.
 * Aliases let a Your Algorithm topic like "Beginner crafts" map without the model.
 */
const ACTIVITY_STYLES: readonly string[] = [
  'beginner-friendly, beginner, beginners, for beginners, beginner friendly',
  'hands-on, hands on, hands-on workshops, diy projects',
  'quiet, calm, cozy, slow living, chill',
  'lively, nightlife, parties, party, social events',
  'outdoors, outdoor, outdoor activities, outside',
  'active, workouts, workout, fitness, exercise',
  'competitive, competition, tournaments, tournament',
  'learning-focused, learning, educational, tutorials, how to',
];

export type VocabEntry = { tag: string; category: EventCategory | null; field: 'interests' | 'activity_prefs' };

function parseLine(line: string): { tag: string; aliases: string[] } {
  const [tag, ...aliases] = line.split(',').map((part) => part.trim());
  return { tag: tag!, aliases };
}

function buildIndex(): Map<string, VocabEntry> {
  const index = new Map<string, VocabEntry>();
  const add = (key: string, entry: VocabEntry) => {
    const normalized = normalizeTag(key);
    if (normalized && !index.has(normalized)) index.set(normalized, entry);
  };
  for (const [category, lines] of Object.entries(INTERESTS) as [EventCategory, readonly string[]][]) {
    for (const { tag, aliases } of lines.map(parseLine)) {
      const entry: VocabEntry = { tag, category, field: 'interests' };
      add(tag, entry);
      aliases.forEach((alias) => add(alias, entry));
    }
  }
  for (const { tag, aliases } of ACTIVITY_STYLES.map(parseLine)) {
    const entry: VocabEntry = { tag, category: null, field: 'activity_prefs' };
    add(tag, entry);
    aliases.forEach((alias) => add(alias, entry));
  }
  return index;
}

const INDEX = buildIndex();

/** Every canonical interest tag, for the mapping prompt's allowed list. */
export const INTEREST_TAGS: readonly string[] = Object.values(INTERESTS).flatMap((lines) => lines.map((l) => parseLine(l).tag));
/** The closed activity-style list. */
export const ACTIVITY_STYLE_TAGS: readonly string[] = ACTIVITY_STYLES.map((l) => parseLine(l).tag);

const BY_TAG = new Map<string, VocabEntry>(
  [...INDEX.values()].map((entry) => [`${entry.field}:${entry.tag}`, entry] as const),
);

/** Exact or alias match for a free-text label; null when it is not in the vocabulary. */
export function lookupLabel(label: string): VocabEntry | null {
  return INDEX.get(normalizeTag(label)) ?? null;
}

/** The entry for a canonical tag in a field, or null when the tag is not on the list. */
export function lookupTag(field: VocabEntry['field'], tag: string): VocabEntry | null {
  return BY_TAG.get(`${field}:${tag}`) ?? null;
}

/** Alias phrases (2+ chars) with their entries, longest first, for scanning a free-text summary. */
export const SUMMARY_PHRASES: ReadonlyArray<{ phrase: string; entry: VocabEntry }> = [...INDEX.entries()]
  .filter(([key]) => key.length >= 3)
  .map(([key, entry]) => ({ phrase: key.replace(/-/g, ' '), entry }))
  .sort((a, b) => b.phrase.length - a.phrase.length);
