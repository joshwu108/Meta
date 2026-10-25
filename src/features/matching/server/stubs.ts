import 'server-only';
import { SLOT_PHRASES } from '@/shared/labels';
import type { ExplainInput } from '@/shared/types';
import type { MatchingPreferences } from './score';

/**
 * Workstream 02's exports. Preferences now delegate to 02's real consent boundary
 * (`@/features/agent`), so 03 no longer reads 02's tables; 02 chunks long id lists itself.
 * `explainRecommendation` stays the templated stand-in until 03 swaps it per its merge plan.
 */

export type SharingPurpose = 'matching' | 'demand' | 'group_plan';

/** Consent-gated preferences for many users; users who have not consented are absent. */
export async function getSharablePreferencesBatch(
  userIds: readonly string[],
  purpose: SharingPurpose,
): Promise<Map<string, MatchingPreferences>> {
  const { getSharablePreferencesBatch: agentBatch } = await import('@/features/agent');
  return agentBatch(userIds, purpose);
}

/** Single-user form of the README contract. */
export async function getSharablePreferences(userId: string, purpose: SharingPurpose): Promise<MatchingPreferences | null> {
  return (await getSharablePreferencesBatch([userId], purpose)).get(userId) ?? null;
}

/** Templated stand-in for 02's `agent.explain_recommendation`; cites only shared fields. */
export async function explainRecommendation(input: ExplainInput): Promise<string> {
  if (input.target.kind !== 'person') return 'Matches what you shared with your agent.';
  const theirs = new Set(input.target.preferences.interests.map((i) => i.toLowerCase()));
  const shared = input.viewer.interests.filter((i) => theirs.has(i.toLowerCase())).slice(0, 2);
  const slots = new Set(input.target.preferences.availabilitySlots);
  const slot = input.viewer.availabilitySlots.find((s) => slots.has(s));
  if (shared.length === 0) return slot ? `You're both free ${SLOT_PHRASES[slot]}.` : 'You live close by and want to meet people.';
  const likes = `You both like ${shared.join(' and ')}`;
  return slot ? `${likes} and are free ${SLOT_PHRASES[slot]}.` : `${likes}.`;
}
