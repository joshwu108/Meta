import 'server-only';
import { logAgentAction } from '@/features/core';
import { getPublicCards, type Actor, type MatchingPreferences } from '@/features/matching';
import { generateStructured } from '@/lib/ai';
import { ApiError } from '@/lib/api/errors';
import { log } from '@/lib/log';
import { createAdminClient } from '@/lib/supabase/admin';
import { planOutputSchema, type PlanSuggestion } from '@/shared/schemas/social';
import { canPlan } from '../authz';
import { loadGroupContext, loadMemberRows } from '../context';
import { toPlanView } from '../plans';
import { getSharablePreferencesBatch, resolveGroupSchedule } from '../stubs';
import type { GroupPlanView } from '../types';
import { loadCandidateEvents } from './candidates';
import { completeSuggestions } from './fallback';
import { buildPlannerInput, scrubNames, type PlannerInput } from './input';
import { buildPrework, type Prework } from './prework';
import { chooseSlots } from './schedule';
import { validateSuggestions } from './validate';

export const PLAN_PROMPT_ID = 'groups.plan_activities' as const;
const MIN_CONSENTING = 2;

async function askModel(input: PlannerInput): Promise<PlanSuggestion[]> {
  try {
    const output = await generateStructured({ prompt: PLAN_PROMPT_ID, input, schema: planOutputSchema, model: 'smart' });
    return output.suggestions;
  } catch (error) {
    // The plan still works without the model: completeSuggestions fills in from the aggregates.
    log.warn('groups.plan.model_failed', { error });
    return [];
  }
}

async function consentingMembers(activeIds: readonly string[]): Promise<MatchingPreferences[]> {
  const shared = await getSharablePreferencesBatch(activeIds, 'group_plan');
  return activeIds.flatMap((id) => {
    const prefs = shared.get(id);
    return prefs ? [prefs] : [];
  });
}

async function storePlan(groupId: string, requestedBy: string, request: string, suggestions: PlanSuggestion[], included: number) {
  const { data, error } = await createAdminClient()
    .from('group_plans')
    .insert({ group_id: groupId, requested_by: requestedBy, request_text: request, suggestions, members_included: included })
    .select('*')
    .single();
  if (error || !data) throw new ApiError('INTERNAL', 'Could not save the plan', 500);
  return data;
}

async function logPlanning(userIds: readonly string[], groupName: string, count: number): Promise<void> {
  await Promise.all(
    userIds.map((userId) =>
      logAgentAction({
        userId,
        actor: 'coordination',
        action: 'group_plan',
        permissionsUsed: ['group_plan'],
        result: `Used your shared preferences to suggest ${count} activities for ${groupName}`,
      }),
    ),
  );
}

/**
 * Slots the plan may use: the ones every consenting member shares, otherwise the best options from
 * 02's schedule resolver that at least half of them can make. VALIDATION when there are none.
 */
function planningSlots(prework: Prework, consenting: readonly MatchingPreferences[]): Prework {
  const slotPlan = chooseSlots(prework.sharedSlots, resolveGroupSchedule(consenting), prework.memberCount);
  if (slotPlan.slots.length === 0) throw new ApiError('VALIDATION', 'Members who allow planning have no free time in common yet.', 400);
  return { ...prework, sharedSlots: slotPlan.slots, availability: { everyoneFree: slotPlan.everyoneFree, freeCounts: slotPlan.freeCounts } };
}

/**
 * POST /api/groups/:id/plan (spec §5 "Group planner"). Only members who allow group planning
 * contribute, and the model sees only aggregates: shared slots, budget envelope, interest counts,
 * a neighborhood label and candidate events, with member names scrubbed from the request.
 */
export async function planForGroup(actor: Actor, groupId: string, request: string): Promise<GroupPlanView> {
  const { group, membership, facts } = await loadGroupContext(actor, groupId);
  if (!canPlan(facts, membership, actor.userId)) throw new ApiError('FORBIDDEN', 'You cannot plan for this group', 403);
  const activeIds = (await loadMemberRows(actor, [groupId], ['active'])).map((row) => row.user_id);
  const consenting = await consentingMembers(activeIds);
  if (consenting.length < MIN_CONSENTING) {
    throw new ApiError('VALIDATION', 'Not enough members have allowed group planning.', 400, { consenting: consenting.length, active: activeIds.length });
  }
  const planning = planningSlots(buildPrework(consenting), consenting);

  const [candidates, cards] = await Promise.all([loadCandidateEvents(actor.userId, planning), getPublicCards(activeIds)]);
  const scrubbed = scrubNames(request, [...cards.values()].map((card) => card.displayName));
  const raw = await askModel(buildPlannerInput(scrubbed, planning, candidates));
  const valid = validateSuggestions(raw, { sharedSlots: planning.sharedSlots, candidateEventIds: new Set(candidates.map((c) => c.id)) });
  const suggestions = completeSuggestions(valid, planning, candidates).map((s) => ({ ...s, freeCount: planning.availability?.freeCounts[s.slot] }));

  const row = await storePlan(groupId, actor.userId, request, suggestions, consenting.length);
  await logPlanning(consenting.map((member) => member.userId), group.name, suggestions.length);
  return toPlanView(actor, row, activeIds.length);
}
