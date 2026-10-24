import 'server-only';
import { getPublicCard, type Actor } from '@/features/matching';
import { ApiError } from '@/lib/api/errors';
import { planSuggestionSchema, type PlanSuggestion } from '@/shared/schemas/social';
import { canVote } from './authz';
import { loadGroupContext, loadMemberRows } from './context';
import type { GroupPlanView, PlanVotes } from './types';

/** Share of active members whose votes make a new activity eligible to request a venue (P1). */
export const VENUE_VOTE_SHARE = 0.5;

type PlanRow = { id: string; group_id: string; requested_by: string | null; request_text: string; suggestions: unknown; members_included: number; created_at: string };
type VoteRow = { suggestion_index: number; user_id: string };

export function parseSuggestions(raw: unknown): PlanSuggestion[] {
  const parsed = planSuggestionSchema.array().safeParse(raw);
  return parsed.success ? parsed.data : [];
}

export function tallyVotes(rows: readonly VoteRow[], suggestionCount: number, userId: string): PlanVotes {
  const counts = Array.from({ length: suggestionCount }, (_, i) => rows.filter((r) => r.suggestion_index === i).length);
  const mine = rows.filter((r) => r.user_id === userId && r.suggestion_index < suggestionCount).map((r) => r.suggestion_index).sort();
  return { counts, mine };
}

/** A new activity that needs a venue can go to 04 once at least half of the active members voted for it. */
export function venueEligibility(suggestions: readonly PlanSuggestion[], counts: readonly number[], activeCount: number): boolean[] {
  return suggestions.map(
    (s, i) => s.kind === 'new_activity' && s.needsVenue && activeCount > 0 && (counts[i] ?? 0) / activeCount >= VENUE_VOTE_SHARE,
  );
}

async function loadVotes(actor: Actor, planId: string): Promise<VoteRow[]> {
  const { data, error } = await actor.supabase.from('group_plan_votes').select('suggestion_index, user_id').eq('plan_id', planId);
  if (error) throw new ApiError('INTERNAL', 'Could not load votes', 500);
  return data ?? [];
}

/** Build the plan view an active member sees: suggestions, consent counts, votes, venue eligibility. */
export async function toPlanView(actor: Actor, row: PlanRow, activeCount: number): Promise<GroupPlanView> {
  const suggestions = parseSuggestions(row.suggestions);
  const [votes, requestedBy] = await Promise.all([loadVotes(actor, row.id), row.requested_by ? getPublicCard(row.requested_by) : null]);
  const tally = tallyVotes(votes, suggestions.length, actor.userId);
  return {
    id: row.id,
    groupId: row.group_id,
    requestText: row.request_text,
    createdAt: row.created_at,
    requestedBy,
    suggestions,
    membersIncluded: row.members_included,
    activeMemberCount: activeCount,
    votes: tally,
    venueEligible: venueEligibility(suggestions, tally.counts, activeCount),
  };
}

/** Latest plan of a group, or null. Plans are readable by active members only (RLS). */
export async function loadLatestPlan(actor: Actor, groupId: string, activeCount: number): Promise<GroupPlanView | null> {
  const { data, error } = await actor.supabase
    .from('group_plans')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new ApiError('INTERNAL', 'Could not load plans', 500);
  return data ? toPlanView(actor, data as PlanRow, activeCount) : null;
}

/** POST /api/groups/:id/plans/:planId/vote (P1): toggle the actor's vote on one suggestion. */
export async function toggleVote(actor: Actor, groupId: string, planId: string, suggestionIndex: number): Promise<GroupPlanView> {
  const { membership } = await loadGroupContext(actor, groupId);
  if (!canVote(membership)) throw new ApiError('FORBIDDEN', 'Only active members can vote', 403);
  const { data: plan } = await actor.supabase.from('group_plans').select('*').eq('id', planId).eq('group_id', groupId).maybeSingle();
  if (!plan) throw new ApiError('NOT_FOUND', 'Plan not found', 404);
  if (suggestionIndex >= parseSuggestions(plan.suggestions).length) throw new ApiError('VALIDATION', 'No suggestion at that position', 400);

  const existing = await actor.supabase
    .from('group_plan_votes')
    .delete()
    .eq('plan_id', planId)
    .eq('suggestion_index', suggestionIndex)
    .eq('user_id', actor.userId)
    .select('plan_id');
  if (existing.error) throw new ApiError('INTERNAL', 'Could not update your vote', 500);
  if ((existing.data ?? []).length === 0) {
    const { error } = await actor.supabase.from('group_plan_votes').insert({ plan_id: planId, suggestion_index: suggestionIndex, user_id: actor.userId });
    if (error) throw new ApiError('INTERNAL', 'Could not record your vote', 500);
  }
  const active = await loadMemberRows(actor, [groupId], ['active']);
  return toPlanView(actor, plan as PlanRow, active.length);
}
