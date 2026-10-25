import 'server-only';
import { createHash } from 'node:crypto';
import { explainRecommendation } from '@/features/agent';
import { log } from '@/lib/log';
import { CATEGORY_PHRASES, SLOT_PHRASES, interestLabel, isCategory } from '@/shared/labels';
import { SOCIAL_GOAL_LABELS } from '../labels';
import type { CompatibilityResult } from '@/shared/types';
import { createTtlCache } from './cache';
import { normalizeTags } from './similarity';
import type { MatchingPreferences } from './score';
import { MATCH_LIMITS } from './weights';

const MAX_LENGTH = 160;
const DAY_WORDS: Record<string, string> = {
  mon: 'monday',
  tue: 'tuesday',
  wed: 'wednesday',
  thu: 'thursday',
  fri: 'friday',
  sat: 'saturday',
  sun: 'sunday',
};

const cache = createTtlCache<string>({ ttlMs: MATCH_LIMITS.explanationTtlMs, maxEntries: 5000 });

/** Stable hash of both users' shared preferences: explanations are reused until either changes. */
export function prefsHash(a: MatchingPreferences, b: MatchingPreferences): string {
  return createHash('sha256').update(JSON.stringify([a, b])).digest('hex').slice(0, 16);
}

/** Words that prove an explanation cites a shared field: interests, slot days, shared goals. */
export function groundingTerms(viewer: MatchingPreferences, candidate: MatchingPreferences, result: CompatibilityResult): string[] {
  const goals = viewer.socialGoals.filter((g) => candidate.socialGoals.includes(g));
  return [
    ...result.sharedInterests.flatMap((value) =>
      isCategory(value) ? [value, CATEGORY_PHRASES[value]] : [value.toLowerCase(), interestLabel(value).toLowerCase()],
    ),
    ...result.sharedSlots.map((slot) => DAY_WORDS[slot.slice(0, 3)] ?? slot),
    ...goals.map((goal) => SOCIAL_GOAL_LABELS[goal].toLowerCase()),
  ];
}

/**
 * Interests and days that appear in either profile but are NOT shared. An explanation that names
 * one claims something the data does not support (e.g. "you both love pottery" when only one does).
 */
export function unsharedTerms(viewer: MatchingPreferences, candidate: MatchingPreferences, result: CompatibilityResult): string[] {
  const shared = new Set(result.sharedInterests);
  const tags = [...new Set([...normalizeTags(viewer.interests), ...normalizeTags(candidate.interests)])].filter((tag) => !shared.has(tag));
  const sharedDays = new Set(result.sharedSlots.map((slot) => DAY_WORDS[slot.slice(0, 3)]));
  const days = [...new Set([...viewer.availabilitySlots, ...candidate.availabilitySlots].map((slot) => DAY_WORDS[slot.slice(0, 3)]))].filter(
    (day): day is string => day !== undefined && !sharedDays.has(day),
  );
  return [...new Set([...tags, ...tags.map(interestLabel), ...days].map((t) => t.toLowerCase()))];
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mentions = (text: string, term: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}`, 'iu').test(text);

/**
 * True when the text cites at least one shared field (or there is nothing shared to cite) and
 * names nothing the two do not share.
 */
export function isGrounded(text: string, terms: readonly string[], unshared: readonly string[] = []): boolean {
  if (text.trim().length === 0) return false;
  if (unshared.some((term) => mentions(text, term))) return false;
  if (terms.length === 0) return true;
  const haystack = text.toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

/** Deterministic explanation built only from shared fields. */
export function templateExplanation(viewer: MatchingPreferences, candidate: MatchingPreferences, result: CompatibilityResult): string {
  const tags = result.sharedInterests.filter((value) => !isCategory(value));
  const interests = (tags.length > 0 ? tags.map(interestLabel) : result.sharedInterests.filter(isCategory).map((c) => CATEGORY_PHRASES[c])).slice(0, 2);
  const slot = result.sharedSlots[0];
  const goal = viewer.socialGoals.find((g) => candidate.socialGoals.includes(g));
  const parts = [
    interests.length > 0 ? `You both like ${interests.join(' and ')}` : null,
    slot ? `${interests.length > 0 ? 'and are' : 'You are both'} free ${SLOT_PHRASES[slot]}` : null,
  ].filter((part): part is string => part !== null);
  if (parts.length > 0) return `${parts.join(' ')}.`.slice(0, MAX_LENGTH);
  if (goal) return `You both want to ${SOCIAL_GOAL_LABELS[goal].toLowerCase()} nearby.`;
  return 'You live close by and have similar plans for meeting people.';
}

/**
 * One-line "why" for a match card: 02's `explainRecommendation` (fast model), cached 24h by
 * (viewer, candidate, prefsHash). Falls back to a deterministic sentence when the AI is
 * unavailable or its answer does not cite any shared field.
 */
export async function explainMatch(
  viewer: MatchingPreferences,
  candidate: MatchingPreferences,
  result: CompatibilityResult,
): Promise<string> {
  const key = `${viewer.userId}:${candidate.userId}:${prefsHash(viewer, candidate)}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const fallback = templateExplanation(viewer, candidate, result);
  let text = fallback;
  try {
    const answer = await explainRecommendation({
      viewer,
      target: { kind: 'person', preferences: candidate },
      breakdown: { ...result.breakdown, sharedInterests: result.sharedInterests, sharedSlots: result.sharedSlots },
    });
    const grounded = isGrounded(answer, groundingTerms(viewer, candidate, result), unsharedTerms(viewer, candidate, result));
    text = grounded ? answer.slice(0, MAX_LENGTH) : fallback;
  } catch (error) {
    log.warn('matching.explain_failed', { error });
  }
  cache.set(key, text);
  return text;
}

/** Test hook. */
export function clearExplanationCache(): void {
  cache.clear();
}
