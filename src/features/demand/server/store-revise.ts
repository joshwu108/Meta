import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GroupSizePref } from '@/shared/enums';
import type { StoredProposal } from '../schemas';
import type { AggregatedCluster } from './aggregate';
import type { Revision, StoredProposalRow } from './revise';

type ClusterRow = {
  signature: string; category: AggregatedCluster['category']; slot: AggregatedCluster['slot']; geocell: string;
  center_lat: number | string; center_lng: number | string; member_count: number;
  top_interests: { tag: string; count: number }[]; group_size_mode: string | null; budget_p50_cents: number | null; activity_prefs: string[];
};

/** Rebuilds the aggregate the validator needs. Members stay server-side and are never loaded here. */
function toCluster(row: ClusterRow, proposal: StoredProposal): AggregatedCluster {
  return {
    category: row.category, slot: row.slot, geocell: row.geocell,
    center: { lat: Number(row.center_lat), lng: Number(row.center_lng) }, members: [],
    signature: row.signature, memberCount: row.member_count, band: proposal.demand.band,
    topInterests: row.top_interests, groupSizeMode: row.group_size_mode as GroupSizePref | null,
    budgetP50Cents: row.budget_p50_cents, activityPrefs: row.activity_prefs,
    neighborhoodLabel: proposal.demand.neighborhoodLabel, rankScore: 0,
  };
}

/**
 * Reads the proposal with the caller's client, so RLS limits it to the owning business, then the
 * cluster aggregate with the service role (owners cannot read the raw columns themselves).
 */
export async function loadProposalForRevision(userClient: SupabaseClient, admin: SupabaseClient, id: string): Promise<StoredProposalRow | null> {
  const { data, error } = await userClient.from('event_proposals').select('id, status, business_id, proposal, business_edits, cluster_id').eq('id', id).maybeSingle();
  if (error) throw new Error(`proposal lookup failed: ${error.message}`);
  if (!data) return null;
  const row = data as Omit<StoredProposalRow, 'cluster'> & { cluster_id: string | null };
  let cluster: AggregatedCluster | null = null;
  if (row.cluster_id) {
    const res = await admin.from('demand_clusters').select('*').eq('id', row.cluster_id).maybeSingle();
    if (res.error) throw new Error(`cluster lookup failed: ${res.error.message}`);
    cluster = res.data ? toCluster(res.data as ClusterRow, row.proposal) : null;
  }
  return { id: row.id, status: row.status, business_id: row.business_id, proposal: row.proposal, business_edits: row.business_edits, cluster };
}

export async function appendRevision(admin: SupabaseClient, id: string, revisions: readonly Revision[]): Promise<void> {
  const { data, error } = await admin.from('event_proposals').select('business_edits').eq('id', id).single();
  if (error) throw new Error(`revision read failed: ${error.message}`);
  const edits = ((data as { business_edits: Record<string, unknown> | null }).business_edits ?? {}) as Record<string, unknown>;
  const update = await admin.from('event_proposals').update({ business_edits: { ...edits, revisions } }).eq('id', id);
  if (update.error) throw new Error(`revision write failed: ${update.error.message}`);
}
