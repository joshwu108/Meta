import 'server-only';
import { SLOT_PHRASES } from '@/shared/labels';
import type { ExplainInput } from '@/shared/types';

/**
 * Stand-ins for workstream 02's exports (specs/02-onboarding-and-agent/specs.md §5), with the
 * signatures 02 ships on ws/02-agent: `getSharablePreferencesBatch(userIds, purpose)` and
 * `explainRecommendation({ viewer, target, breakdown })`. They are the only code in workstream 03
 * that reads 02's tables. Delete this file and import from `@/features/agent` once 02 is on main.
 */

/** 02 is on main: preferences come through its consent boundary. */
export { getSharablePreferences, getSharablePreferencesBatch, type SharingPurpose } from '@/features/agent';

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
