import 'server-only';
import type { LatLng } from '@/features/matching';
import { ApiError } from '@/lib/api/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { uuidSchema } from '@/shared/schemas/common';
import type { AvailabilitySlot, EventCategory } from '@/shared/enums';
import { buildPrework } from './planner/prework';
import { parseSuggestions, VENUE_VOTE_SHARE } from './plans';
import { getSharablePreferencesBatch } from './stubs';

/**
 * What 04 needs to turn a voted group idea into a venue proposal (03 spec §5 step 7, 04 P1).
 * Aggregates only: no member ids, names or individual preferences.
 */
export type GroupVenueRequest = {
  groupId: string;
  planId: string;
  suggestionIndex: number;
  title: string;
  description: string;
  category: EventCategory;
  slot: AvailabilitySlot;
  estimatedCostCents: number | null;
  activeMembers: number;
  votes: number;
  budgetMaxCents: number | null;
  neighborhood: string | null;
  center: LatLng | null;
};

async function activeMemberIds(groupId: string): Promise<string[]> {
  const { data, error } = await createAdminClient().from('group_members').select('user_id').eq('group_id', groupId).eq('status', 'active');
  if (error) throw new ApiError('INTERNAL', 'Could not load group members', 500);
  return (data ?? []).map((row) => row.user_id);
}

/**
 * The suggestion behind a group's "Request venue", or null unless it is a `new_activity` that
 * needs a venue and has votes from at least half of the active members.
 */
export async function getGroupVenueRequest(groupId: string, planId: string, suggestionIndex: number): Promise<GroupVenueRequest | null> {
  const admin = createAdminClient();
  const { data: plan } = await admin
    .from('group_plans')
    .select('id, suggestions')
    .eq('id', uuidSchema.parse(planId))
    .eq('group_id', uuidSchema.parse(groupId))
    .maybeSingle();
  const suggestion = plan ? parseSuggestions(plan.suggestions)[suggestionIndex] : undefined;
  if (!suggestion || suggestion.kind !== 'new_activity' || !suggestion.needsVenue) return null;
  const [memberIds, votes] = await Promise.all([
    activeMemberIds(groupId),
    admin.from('group_plan_votes').select('user_id', { count: 'exact', head: true }).eq('plan_id', planId).eq('suggestion_index', suggestionIndex),
  ]);
  const voteCount = votes.count ?? 0;
  if (memberIds.length === 0 || voteCount / memberIds.length < VENUE_VOTE_SHARE) return null;
  const consenting = [...(await getSharablePreferencesBatch(memberIds, 'group_plan')).values()];
  const prework = buildPrework(consenting);
  return {
    groupId,
    planId,
    suggestionIndex,
    title: suggestion.title,
    description: suggestion.description,
    category: suggestion.category,
    slot: suggestion.slot,
    estimatedCostCents: suggestion.estimatedCostCents,
    activeMembers: memberIds.length,
    votes: voteCount,
    budgetMaxCents: prework.budgetMaxCents,
    neighborhood: prework.neighborhood,
    center: prework.center,
  };
}
