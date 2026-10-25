import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Core feature stress: generate events from the data we actually collect. The pipeline suite next
 * door runs a hand-shaped world; this one runs the real demo dataset — every seeded member, their
 * real consent flags, every seeded venue — and holds the output to the privacy and provenance
 * rules in specs/README.md §3 and specs/04 §5.
 */

vi.mock('server-only', () => ({}));
process.env.MOCK_AI = '1';
/**
 * The point of this suite is the generated population: clustering has nothing to work with
 * otherwise, and every cluster falls under the privacy threshold. The project default is 0, so
 * this asks for the cohort explicitly and puts the dataset back afterwards for the suites that
 * assert on the hand-written fixtures.
 */
const COHORT = '300';

const { adminClient } = await import('../helpers');
const { runPipeline } = await import('@/features/demand/server/pipeline');
const { supabaseDeps } = await import('@/features/demand/server/wiring');
const { DEMAND_CONFIG } = await import('@/features/demand/server/config');
const { runSeedWith } = await import('../../../supabase/seed/runner');

const admin = adminClient() as unknown as SupabaseClient;

type Proposal = {
  id: string;
  business_id: string;
  cluster_id: string;
  status: string;
  proposal: {
    title: string;
    description: string;
    category: string;
    suggestedSlot: string;
    suggestedStartsAt: string;
    suggestedCapacity: number;
    demand: { band: string; cohortSize?: number };
  };
};

type Cluster = {
  id: string;
  category: string;
  slot: string;
  member_count: number;
};

let proposals: Proposal[] = [];
let clusters = new Map<string, Cluster>();
let summary: Awaited<ReturnType<typeof runPipeline>>;
let elapsedMs = 0;
let eligibleInDb = 0;
let consentingInDb = 0;

beforeAll(async () => {
  await admin.from('event_proposals').delete().not('id', 'is', null);
  await admin.from('opportunity_runs').delete().not('id', 'is', null);
  // The whole demo dataset, not a fixture tuned to produce a cluster.
  process.env.SEED_SCALE = COHORT;
  await runSeedWith(admin as never);

  const eligible = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .not('onboarding_completed_at', 'is', null)
    .eq('is_adult_confirmed', true);
  eligibleInDb = eligible.count ?? 0;

  const consenting = await admin
    .from('agent_profiles')
    .select('user_id, consent')
    .eq('consent->allow_demand_aggregation', true);
  consentingInDb = (consenting.data ?? []).length;

  const startedAt = Date.now();
  summary = await runPipeline(supabaseDeps(admin), { triggeredBy: 'manual' });
  elapsedMs = Date.now() - startedAt;

  const [rows, clusterRows] = await Promise.all([
    admin.from('event_proposals').select('id, business_id, cluster_id, status, proposal'),
    admin.from('demand_clusters').select('id, category, slot, member_count'),
  ]);
  proposals = (rows.data ?? []) as Proposal[];
  clusters = new Map(((clusterRows.data ?? []) as Cluster[]).map((row) => [row.id, row]));
}, 180_000);

afterAll(async () => {
  await admin.from('event_proposals').delete().not('id', 'is', null);
  await admin.from('opportunity_runs').delete().not('id', 'is', null);
  // Hand the dataset back the way the rest of the suite expects to find it.
  process.env.SEED_SCALE = '0';
  await runSeedWith(admin as never);
}, 180_000);

describe('the pipeline on the real dataset', () => {
  it('counts every member who consented, and only those', () => {
    // The generated cohort is what gives clustering anything to work with; if the pipeline only
    // ever saw the handful of hand-written demo members, every cluster would fall under the
    // privacy threshold and the feature would look broken for reasons unrelated to the code.
    expect(eligibleInDb).toBeGreaterThan(100);
    expect(consentingInDb).toBeGreaterThan(100);
    // Equality in both directions: fewer means demand is being silently dropped, more means the
    // consent gate let somebody through who never agreed to be counted.
    expect(summary.stats?.usersConsidered ?? 0).toBe(consentingInDb);
    expect(consentingInDb).toBeLessThanOrEqual(eligibleInDb);
  });

  it('turns collected demand into proposals', () => {
    expect(summary.clustersDetected).toBeGreaterThan(0);
    expect(summary.proposalsCreated).toBeGreaterThan(0);
    expect(proposals.length).toBe(summary.proposalsCreated);
    expect(clusters.size).toBeGreaterThan(0);
  });

  it('finishes inside the budget a cron run has', () => {
    expect(
      elapsedMs,
      `${summary.clustersDetected} clusters → ${summary.proposalsCreated} proposals in ${elapsedMs}ms`,
    ).toBeLessThan(120_000);
  });

  it('never builds a cluster smaller than the privacy threshold', () => {
    expect(clusters.size).toBeGreaterThan(0);
    for (const cluster of clusters.values()) {
      expect(cluster.member_count, `cluster ${cluster.id}`).toBeGreaterThanOrEqual(DEMAND_CONFIG.minCohortSize);
    }
  });

  it('keeps every proposal faithful to the cluster it came from', () => {
    expect(proposals.length).toBeGreaterThan(0);
    for (const proposal of proposals) {
      const cluster = clusters.get(proposal.cluster_id);
      expect(cluster, `proposal ${proposal.id} has a cluster`).toBeDefined();
      expect(proposal.proposal.category).toBe(cluster!.category);
      expect(proposal.proposal.suggestedSlot).toBe(cluster!.slot);
    }
  });

  it('routes each proposal to a venue that can actually host it', async () => {
    expect(proposals.length).toBeGreaterThan(0);
    const businessIds = [...new Set(proposals.map((p) => p.business_id))];
    const { data } = await admin
      .from('business_capabilities')
      .select('business_id, event_categories')
      .in('business_id', businessIds);
    const byBusiness = new Map(
      ((data ?? []) as Array<{ business_id: string; event_categories: string[] }>).map((row) => [
        row.business_id,
        row.event_categories,
      ]),
    );
    for (const proposal of proposals) {
      const categories = byBusiness.get(proposal.business_id);
      expect(categories, `business ${proposal.business_id} has capabilities`).toBeDefined();
      expect(categories).toContain(proposal.proposal.category);
    }
  });

  it('gives every venue the lead time it is owed', () => {
    expect(proposals.length).toBeGreaterThan(0);
    const earliest = Date.now() + DEMAND_CONFIG.minDaysOut * 86_400_000;
    for (const proposal of proposals) {
      expect(Date.parse(proposal.proposal.suggestedStartsAt)).toBeGreaterThanOrEqual(earliest);
    }
  });

  it('writes a proposal per cluster and venue, not one boilerplate for everyone', () => {
    expect(proposals.length).toBeGreaterThan(0);
    const pairs = proposals.map((p) => `${p.cluster_id}|${p.business_id}`);
    expect(new Set(pairs).size).toBe(pairs.length);
    // Several clusters must not collapse into one identical document.
    if (clusters.size > 1 && proposals.length > 1) {
      const titles = new Set(proposals.map((p) => p.proposal.title));
      const capacities = new Set(proposals.map((p) => p.proposal.suggestedCapacity));
      expect(titles.size + capacities.size).toBeGreaterThan(2);
    }
  });

  it('arrives at the owner as pending, never pre-approved', () => {
    expect(proposals.length).toBeGreaterThan(0);
    for (const proposal of proposals) expect(proposal.status).toBe('pending');
  });

  it('does not double-propose when it runs again', async () => {
    const before = proposals.length;
    const second = await runPipeline(supabaseDeps(admin), { triggeredBy: 'cron' });
    expect(second.proposalsCreated).toBe(0);
    const { data } = await admin.from('event_proposals').select('id');
    expect((data ?? []).length).toBe(before);
  }, 180_000);
});
