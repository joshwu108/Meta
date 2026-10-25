import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { AVAILABILITY_SLOT, EVENT_CATEGORY, GROUP_SIZE_PREF, SOCIAL_GOAL } from '@/shared/enums';
import { SLOT_PHRASES } from '@/shared/labels';
import type { AvailabilitySlot, EventCategory, ExplainInput, GroupSizePref, SocialGoal } from '@/shared/types';
import type { MatchingPreferences } from './score';

/**
 * Stand-ins for workstream 02's exports (specs/02-onboarding-and-agent/specs.md §5), with the
 * signatures 02 ships on ws/02-agent: `getSharablePreferencesBatch(userIds, purpose)` and
 * `explainRecommendation({ viewer, target, breakdown })`. They are the only code in workstream 03
 * that reads 02's tables. Delete this file and import from `@/features/agent` once 02 is on main.
 */

export type SharingPurpose = 'matching' | 'demand' | 'group_plan';

const CONSENT_FLAG: Record<SharingPurpose, string> = {
  matching: 'allow_matching',
  demand: 'allow_demand_aggregation',
  group_plan: 'allow_group_planning',
};

type PrefsRow = {
  user_id: string;
  interests: string[] | null;
  interest_categories: string[] | null;
  availability_slots: string[] | null;
  social_goals: string[] | null;
  group_size_pref: string | null;
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  travel_radius_km: number | string | null;
  activity_prefs: string[] | null;
};
type ConsentRow = { user_id: string; consent: Record<string, unknown> | null };
type ProfileRow = { id: string; is_discoverable: boolean; coarse_lat: number | string | null; coarse_lng: number | string | null; neighborhood: string | null };

const only = <T extends string>(allowed: readonly T[], values: string[] | null): T[] =>
  (values ?? []).filter((v): v is T => (allowed as readonly string[]).includes(v));

const toNumber = (value: number | string | null): number | null => (value === null ? null : Number(value));

function toSharable(prefs: PrefsRow, profile: ProfileRow): MatchingPreferences {
  const groupSize = (GROUP_SIZE_PREF as readonly string[]).includes(prefs.group_size_pref ?? '')
    ? (prefs.group_size_pref as GroupSizePref)
    : 'small';
  return {
    userId: prefs.user_id,
    interests: [...(prefs.interests ?? [])],
    interestCategories: only<EventCategory>(EVENT_CATEGORY, prefs.interest_categories),
    availabilitySlots: only<AvailabilitySlot>(AVAILABILITY_SLOT, prefs.availability_slots),
    socialGoals: only<SocialGoal>(SOCIAL_GOAL, prefs.social_goals),
    groupSizePref: groupSize,
    budgetMin: prefs.budget_min_cents,
    budgetMax: prefs.budget_max_cents,
    travelRadiusKm: toNumber(prefs.travel_radius_km) ?? 5,
    activityPrefs: [...(prefs.activity_prefs ?? [])],
    coarseLat: toNumber(profile.coarse_lat),
    coarseLng: toNumber(profile.coarse_lng),
    neighborhood: profile.neighborhood,
  };
}

async function loadRows(db: SupabaseClient, ids: readonly string[]) {
  const [prefs, consent, profiles] = await Promise.all([
    db.from('user_preferences').select('*').in('user_id', ids),
    db.from('agent_profiles').select('user_id, consent').in('user_id', ids),
    db.from('profiles').select('id, is_discoverable, coarse_lat, coarse_lng, neighborhood').in('id', ids),
  ]);
  const error = prefs.error ?? consent.error ?? profiles.error;
  if (error) throw new Error(`sharable preferences read failed: ${error.message}`);
  return {
    prefs: (prefs.data ?? []) as PrefsRow[],
    consent: new Map(((consent.data ?? []) as ConsentRow[]).map((row) => [row.user_id, row.consent ?? {}])),
    profiles: new Map(((profiles.data ?? []) as ProfileRow[]).map((row) => [row.id, row])),
  };
}

/**
 * Consent-gated preferences for many users; users who have not consented are absent. Like 02's,
 * one read per table with every id in a single filter, so callers chunk long id lists.
 */
export async function getSharablePreferencesBatch(
  userIds: readonly string[],
  purpose: SharingPurpose,
): Promise<Map<string, MatchingPreferences>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const rows = await loadRows(createAdminClient() as unknown as SupabaseClient, ids);
  const shared = rows.prefs.flatMap((prefs) => {
    const profile = rows.profiles.get(prefs.user_id);
    if (!profile || rows.consent.get(prefs.user_id)?.[CONSENT_FLAG[purpose]] !== true) return [];
    if (purpose === 'matching' && !profile.is_discoverable) return [];
    return [toSharable(prefs, profile)];
  });
  return new Map(shared.map((p) => [p.userId, p]));
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
