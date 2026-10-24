import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));
process.env.MOCK_AI = '1';

const { adminClient, cleanupTestUsers } = await import('../helpers');
const { applyTestSchema, seedScene3 } = await import('./scene3');
const { supabaseDeps } = await import('@/features/demand/server/wiring');
const { runPipeline, PipelineBusyError } = await import('@/features/demand/server/pipeline');

type World = Awaited<ReturnType<typeof seedScene3>>;

/** Generated types do not include ws04 tables until `pnpm db:types` runs on main. */
const db = (client: unknown) => client as SupabaseClient;

const admin = adminClient() as unknown as SupabaseClient;
let world: World;
let firstRun: Awaited<ReturnType<typeof runPipeline>>;

async function clearDemandTables(): Promise<void> {
  await admin.from('event_proposals').delete().not('id', 'is', null);
  await admin.from('opportunity_runs').delete().not('id', 'is', null);
}

beforeAll(async () => {
  applyTestSchema();
  await cleanupTestUsers(admin as never);
  await clearDemandTables();
  world = await seedScene3(admin);
  firstRun = await runPipeline(supabaseDeps(admin), { triggeredBy: 'manual' });
}, 120_000);

afterAll(async () => {
  await clearDemandTables();
  await cleanupTestUsers(admin as never);
});

async function proposalsFor(businessName: string) {
  const owner = world.owners.get(businessName)!;
  const { data } = await admin.from('event_proposals').select('id, proposal, cluster_id').eq('business_id', owner.businessId);
  return (data ?? []) as Array<{ id: string; cluster_id: string; proposal: { title: string; category: string; suggestedSlot: string; demand: { band: string }; assumptionsToValidate: string[]; suggestedStartsAt: string } }>;
}

describe('ws04 pipeline against local Supabase (MOCK_AI, Scene 3)', () => {
  it('creates one creative/thu_eve proposal for Kiln & Cup and one games/fri_eve for Meeple House', async () => {
    const kiln = (await proposalsFor('Kiln & Cup')).filter((p) => p.proposal.category === 'creative' && p.proposal.suggestedSlot === 'thu_eve');
    const meeple = (await proposalsFor('Meeple House')).filter((p) => p.proposal.category === 'games' && p.proposal.suggestedSlot === 'fri_eve');
    expect(kiln).toHaveLength(1);
    expect(kiln[0]?.proposal.title).toBe('Beginner Pottery & Coffee Night');
    expect(kiln[0]?.proposal.demand.band).toBe('6-9');
    expect(kiln[0]?.proposal.assumptionsToValidate.length).toBeGreaterThan(0);
    expect(kiln[0]?.proposal.suggestedStartsAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(meeple).toHaveLength(1);
  });

  it('never puts the opted-out user in demand_cluster_members', async () => {
    const { data, error } = await admin.from('demand_cluster_members').select('user_id');
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
    expect((data ?? []).map((r) => r.user_id)).not.toContain(world.optedOutId);
  });

  it('populates run stats and notifies the owner', async () => {
    const { data: run } = await admin.from('opportunity_runs').select('status, stats, finished_at').eq('id', firstRun.runId).single();
    expect(run?.status).toBe('completed');
    expect(run?.stats).toMatchObject({ stage: 'done', usersConsidered: 13, proposalsCreated: firstRun.stats.proposalsCreated });
    expect(run?.finished_at).not.toBeNull();
    const owner = world.owners.get('Kiln & Cup')!;
    const { data: notes } = await db(owner.client).from('notifications').select('type, payload');
    expect(notes?.some((n) => n.type === 'proposal_received' && (n.payload as { demandBand?: string }).demandBand === '6-9')).toBe(true);
  });

  it('lets the owner read their proposal but nothing that identifies people', async () => {
    const owner = world.owners.get('Kiln & Cup')!;
    const proposals = await db(owner.client).from('event_proposals').select('id, business_id, proposal');
    expect(proposals.error).toBeNull();
    expect(proposals.data?.length).toBeGreaterThan(0);
    expect(proposals.data?.every((p) => p.business_id === owner.businessId)).toBe(true);
    const text = JSON.stringify(proposals.data);
    for (const consumer of world.consumers.values()) expect(text).not.toContain(consumer.id);

    const members = await db(owner.client).from('demand_cluster_members').select('user_id');
    expect(members.data ?? []).toHaveLength(0);
    const runs = await db(owner.client).from('opportunity_runs').select('id');
    expect(runs.data ?? []).toHaveLength(0);

    const safe = await db(owner.client).from('demand_clusters').select('id, category, slot');
    expect(safe.data?.length).toBeGreaterThan(0);
    const raw = await db(owner.client).from('demand_clusters').select('member_count');
    expect(raw.error).not.toBeNull();
    const geo = await db(owner.client).from('demand_clusters').select('geocell, center_lat, top_interests');
    expect(geo.error).not.toBeNull();
  });

  it('does not show another business its proposals', async () => {
    const meeple = world.owners.get('Meeple House')!;
    const kilnId = world.owners.get('Kiln & Cup')!.businessId;
    const { data } = await db(meeple.client).from('event_proposals').select('business_id');
    expect((data ?? []).every((p) => p.business_id !== kilnId)).toBe(true);
  });

  it('creates 0 new proposals on a second run within 14 days', async () => {
    const second = await runPipeline(supabaseDeps(admin), { triggeredBy: 'manual' });
    expect(second.stats.proposalsCreated).toBe(0);
    expect(second.stats.skippedDuplicate).toBe(firstRun.stats.proposalsCreated);
  });

  it('refuses a second run while one is in progress', async () => {
    const deps = supabaseDeps(admin);
    const held = await deps.startRun('manual');
    expect(held).not.toBeNull();
    try {
      await expect(runPipeline(deps, { triggeredBy: 'cron' })).rejects.toBeInstanceOf(PipelineBusyError);
    } finally {
      await deps.updateRun(held as string, { status: 'completed', finished: true });
    }
  });

  it('lets the owner revise their proposal into business_edits, and hides it from other owners (P1)', async () => {
    const { reviseProposal } = await import('@/features/demand/server/revise');
    const { reviseDeps } = await import('@/features/demand/server/revise-wiring');
    const kilnOwner = world.owners.get('Kiln & Cup')!;
    const [p] = (await proposalsFor('Kiln & Cup')).filter((x) => x.proposal.category === 'creative');
    const out = await reviseProposal(p!.id, { priceCents: 2500, note: 'Owner wants $25' }, reviseDeps(db(kilnOwner.client), admin));
    expect(out.revision.suggestedPriceCents).toBe(2500);
    const { data } = await admin.from('event_proposals').select('proposal, business_edits').eq('id', p!.id).single();
    expect((data?.proposal as { suggestedPriceCents: number }).suggestedPriceCents).toBe(2000);
    expect((data?.business_edits as { revisions: unknown[] }).revisions).toHaveLength(1);

    const meeple = world.owners.get('Meeple House')!;
    const denied = await reviseProposal(p!.id, { note: 'not mine' }, reviseDeps(db(meeple.client), admin)).catch((e: { code?: string }) => e);
    expect((denied as { code?: string }).code).toBe('NOT_FOUND');
  });

  it('keeps the proposal document immutable', async () => {
    const [p] = await proposalsFor('Kiln & Cup');
    const { error } = await admin.from('event_proposals').update({ proposal: { title: 'changed' } }).eq('id', p!.id);
    expect(error?.message).toMatch(/immutable/);
  });
});
