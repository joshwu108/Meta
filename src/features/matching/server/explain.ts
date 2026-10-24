import 'server-only';
import { createHash } from 'node:crypto';
import { log } from '@/lib/log';
import { SLOT_PHRASES, interestLabel } from '@/shared/slot-labels';
import { CATEGORY_PHRASES, SOCIAL_GOAL_LABELS, isCategory } from '../labels';
import type { CompatibilityResult } from '@/shared/types';
import { createTtlCache } from './cache';
import type { MatchingPreferences } from './score';
import { explainRecommendation } from './stubs';
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

/** True when the text mentions at least one shared field (or there is nothing shared to cite). */
export function isGrounded(text: string, terms: readonly string[]): boolean {
  if (text.trim().length === 0) return false;
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
    text = isGrounded(answer, groundingTerms(viewer, candidate, result)) ? answer.slice(0, MAX_LENGTH) : fallback;
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
