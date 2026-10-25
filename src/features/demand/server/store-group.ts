import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@/lib/api';
import type { GroupDeps, GroupKey, GroupVenueRequest } from './group';

/** Group-originated rows in `event_proposals` (0404), written with the service role. */

export async function hasPendingGroupProposal(admin: SupabaseClient, key: GroupKey): Promise<boolean> {
  const { data, error } = await admin
    .from('event_proposals')
    .select('id')
    .eq('source', 'group')
    .eq('status', 'pending')
    .eq('source_group_id', key.groupId)
    .eq('source_plan_id', key.planId)
    .eq('source_suggestion_index', key.suggestionIndex)
    .limit(1);
  if (error) throw new Error(`group dedup check failed: ${error.message}`);
  return (data ?? []).length > 0;
}

export function groupProposalSaver(admin: SupabaseClient): GroupDeps['saveGroupProposal'] {
  return async ({ key, businessId, proposal }) => {
    const { data, error } = await admin
      .from('event_proposals')
      .insert({
        source: 'group', source_group_id: key.groupId, source_plan_id: key.planId,
        source_suggestion_index: key.suggestionIndex, business_id: businessId, proposal,
      })
      .select('id')
      .single();
    if (error?.code === '23505') return null; // one pending proposal per suggestion
    if (error) throw new Error(`save group proposal failed: ${error.message}`);
    return (data as { id: string }).id;
  };
}

/** Uses the caller's client: 03's RLS lets members read their own group's membership rows. */
export async function isActiveGroupMember(client: SupabaseClient, userId: string, groupId: string): Promise<boolean> {
  const { data, error } = await client
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) return false; // 03's table not on this branch yet: fail closed
  return data != null;
}

/**
 * Stub for 03's `getGroupVenueRequest` from '@/features/groups' (on origin/ws/03-matching, not main).
 * Rebuilding it here would mean reading members' preferences without 02's consent boundary, so the
 * stub refuses instead. Delete it and import the real export once 03 reaches main.
 */
export async function stubGetGroupVenueRequest(_groupId: string, _planId: string, _suggestionIndex: number): Promise<GroupVenueRequest | null> {
  throw new ApiError('AI_UNAVAILABLE', 'Group venue requests are not available yet', 503);
}
