import { normalizeTag } from '@/features/matching';

/**
 * Categories 07 never suggests (spec 07 §11.4, README §3). Matching is on whole kebab-separated
 * words of the normalized label, so "wine" blocks "natural-wine" but "winery-tours" is caught by
 * its own stem. Users can still type any of these themselves through 02.
 */
const BLOCKED_WORDS: readonly string[] = [
  // health, medical, mental health, weight
  'health', 'medical', 'medicine', 'doctor', 'therapy', 'therapist', 'mental', 'anxiety', 'depression', 'adhd',
  'autism', 'disorder', 'diagnosis', 'symptoms', 'cancer', 'diabetes', 'pregnancy', 'pregnant', 'fertility', 'ivf',
  'menopause', 'supplements', 'supplement', 'vitamins', 'pharmacy', 'medication', 'meds', 'diet', 'dieting', 'keto',
  'weight', 'weightloss', 'ozempic', 'calories', 'fasting', 'rehab', 'sobriety', 'sober', 'wellness', 'skincare',
  // sexuality, gender identity, dating
  'dating', 'date', 'tinder', 'hinge', 'bumble', 'lgbt', 'lgbtq', 'gay', 'lesbian', 'queer', 'bisexual', 'trans',
  'transgender', 'nonbinary', 'sexuality', 'sexual', 'sex', 'pride', 'onlyfans', 'lingerie', 'relationship', 'relationships',
  // religion and spirituality
  'religion', 'religious', 'church', 'christian', 'christianity', 'bible', 'jesus', 'catholic', 'islam', 'muslim',
  'quran', 'mosque', 'jewish', 'judaism', 'torah', 'synagogue', 'hindu', 'hinduism', 'buddhism', 'buddhist', 'prayer',
  'spirituality', 'spiritual', 'astrology', 'tarot', 'horoscope', 'zodiac', 'manifestation',
  // politics and activism
  'politics', 'political', 'election', 'elections', 'democrat', 'democrats', 'republican', 'republicans', 'liberal',
  'conservative', 'trump', 'biden', 'harris', 'activism', 'activist', 'protest', 'protests', 'campaign', 'vote', 'voting',
  'immigration', 'abortion', 'prolife', 'prochoice',
  // ethnicity and national origin
  'ethnicity', 'ethnic', 'race', 'racial', 'nationality', 'heritage', 'diaspora', 'latino', 'latina', 'latinx',
  'african', 'asian', 'hispanic', 'indigenous', 'immigrant', 'immigrants',
  // finances, debt, gambling
  'finance', 'finances', 'financial', 'debt', 'loan', 'loans', 'credit', 'mortgage', 'investing', 'investment',
  'stocks', 'crypto', 'bitcoin', 'trading', 'forex', 'gambling', 'casino', 'betting', 'sportsbook', 'lottery', 'money',
  'income', 'salary', 'bankruptcy',
  // alcohol, cannabis, tobacco
  'alcohol', 'beer', 'beers', 'wine', 'wines', 'winery', 'cocktail', 'cocktails', 'whiskey', 'vodka', 'tequila',
  'brewery', 'breweries', 'drinking', 'cannabis', 'marijuana', 'weed', 'cbd', 'thc', 'tobacco',
  'cigar', 'cigars', 'cigarettes', 'vape', 'vaping', 'smoking', 'hookah', 'psychedelics', 'drugs',
  // legal and crime
  'legal', 'lawyer', 'attorney', 'lawsuit', 'court', 'crime', 'criminal', 'prison', 'police', 'arrest', 'truecrime',
  // weapons
  'weapon', 'weapons', 'gun', 'guns', 'firearm', 'firearms', 'rifle', 'shooting', 'ammo', 'hunting',
  // parenting and children
  'parenting', 'parent', 'parents', 'mom', 'moms', 'dad', 'dads', 'baby', 'babies', 'toddler', 'toddlers', 'kids',
  'children', 'child', 'motherhood', 'fatherhood', 'nursery',
];

/** Multi-word phrases that are sensitive even though no single word is (matched on the kebab form). */
const BLOCKED_PHRASES: readonly string[] = ['true-crime', 'weight-loss', 'self-care', 'birth-control', 'happy-hour', 'pub-crawl'];

const BLOCKED = new Set(BLOCKED_WORDS);

/**
 * True when a label or tag touches a sensitive category. Applied to every label the model returns,
 * to every mapped value, and to "Less of this" topics before anything is stored.
 */
export function isSensitive(text: string): boolean {
  const kebab = normalizeTag(text);
  if (!kebab) return false;
  if (BLOCKED_PHRASES.some((phrase) => kebab === phrase || kebab.includes(phrase))) return true;
  return kebab.split('-').some((word) => BLOCKED.has(word) || BLOCKED.has(word.replace(/s$/, '')));
}
