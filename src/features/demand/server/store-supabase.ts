import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RunStage, RunStats } from '../schemas';
import type { AggregatedCluster } from './aggregate';
import type { PipelineDeps, RunUpdate, TriggeredBy } from './deps';

/** Tables owned by 04, reached with the service-role client (RLS gives other roles no access). */

export async function startRun(admin: SupabaseClient, triggeredBy: TriggeredBy): Promise<string | null> {
  const { data, error } = await admin.rpc('start_opportunity_run', { trigger_source: triggeredBy });
  if (error) throw new Error(`start run failed: ${error.message}`);
  return (data as string | null) ?? null;
}

/** Keeps the last stage and stats per run so each update writes the full stats object. */
export function runUpdater(admin: SupabaseClient): PipelineDeps['updateRun'] {
  const last = new Map<string, { stage?: RunStage; stats?: RunStats }>();
  return async (runId: string, update: RunUpdate) => {
    const prev = last.get(runId) ?? {};
    const next = { stage: update.stage ?? prev.stage, stats: update.stats ?? prev.stats };
    last.set(runId, next);
    const row: Record<string, unknown> = { stats: { ...(next.stats ?? {}), stage: next.stage } };
    if (update.status) row['status'] = update.status;
    if (update.error) row['error'] = update.error;
    if (update.finished) row['finished_at'] = new Date().toISOString();
    const { error } = await admin.from('opportunity_runs').update(row).eq('id', runId);
    if (error) throw new Error(`update run failed: ${error.message}`);
  };
}

export async function listEligibleUserIds(admin: SupabaseClient): Promise<string[]> {
  const { data, error } = await admin
    .from('profiles')
    .select('id')
    .not('onboarding_completed_at', 'is', null)
    .eq('is_adult_confirmed', true);
  if (error) throw new Error(`eligible users failed: ${error.message}`);
  return (data as Array<{ id: string }>).map((r) => r.id);
}

export async function hasRecentPendingProposal(admin: SupabaseClient, signature: string, since: Date): Promise<boolean> {
  const { data, error } = await admin
    .from('event_proposals')
    .select('id, demand_clusters!inner(signature)')
    .eq('status', 'pending')
    .eq('demand_clusters.signature', signature)
    .gte('created_at', since.toISOString())
    .limit(1);
  if (error) throw new Error(`dedup check failed: ${error.message}`);
  return (data ?? []).length > 0;
}

function clusterRow(c: AggregatedCluster) {
  return {
    signature: c.signature, category: c.category, slot: c.slot, geocell: c.geocell,
    center_lat: c.center.lat, center_lng: c.center.lng, top_interests: c.topInterests,
    group_size_mode: c.groupSizeMode, budget_p50_cents: c.budgetP50Cents, activity_prefs: c.activityPrefs,
  };
}

export async function saveProposal(admin: SupabaseClient, input: Parameters<PipelineDeps['saveProposal']>[0]): Promise<string> {
  const { data, error } = await admin.rpc('save_demand_proposal', {
    p_run_id: input.runId,
    p_cluster: clusterRow(input.cluster),
    p_member_ids: input.cluster.members.map((m) => m.userId),
    p_business_id: input.venue.match.businessId,
    p_proposal: input.proposal,
  });
  if (error) throw new Error(`save proposal failed: ${error.message}`);
  return data as string;
}

export type RunView = {
  status: 'running' | 'completed' | 'failed';
  stage: RunStage | null;
  stats: Partial<RunStats>;
  proposals: { id: string; title: string; businessName: string; demandBand: string; status: string; category: string; slot: string; neighborhood: string }[];
};

export async function getRunView(admin: SupabaseClient, runId: string): Promise<RunView | null> {
  const { data: run, error } = await admin.from('opportunity_runs').select('status, stats').eq('id', runId).maybeSingle();
  if (error) throw new Error(`run lookup failed: ${error.message}`);
  if (!run) return null;
  const { data: rows, error: pErr } = await admin.from('event_proposals').select('id, status, business_id, proposal').eq('run_id', runId).order('created_at');
  if (pErr) throw new Error(`run proposals failed: ${pErr.message}`);
  const proposals = (rows ?? []) as Array<{ id: string; status: string; business_id: string; proposal: Record<string, unknown> }>;
  const names = await businessNames(admin, proposals.map((p) => p.business_id));
  const { stage, ...stats } = (run.stats ?? {}) as Partial<RunStats> & { stage?: RunStage };
  return {
    status: run.status as RunView['status'],
    stage: stage ?? null,
    stats,
    proposals: proposals.map((p) => {
      const doc = p.proposal as { title: string; category: string; suggestedSlot: string; demand: { band: string; neighborhoodLabel: string } };
      return {
        id: p.id, title: doc.title, businessName: names.get(p.business_id) ?? 'Unknown venue', demandBand: doc.demand.band,
        status: p.status, category: doc.category, slot: doc.suggestedSlot, neighborhood: doc.demand.neighborhoodLabel,
      };
    }),
  };
}

async function businessNames(admin: SupabaseClient, ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await admin.from('businesses').select('id, name').in('id', [...new Set(ids)]);
  return new Map(((data ?? []) as Array<{ id: string; name: string }>).map((b) => [b.id, b.name]));
}
