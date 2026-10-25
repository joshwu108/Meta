import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type * as NextServer from 'next/server';

vi.mock('server-only', () => ({}));
process.env.MOCK_AI = '1';

const { adminClient, cleanupTestUsers } = await import('../helpers');
const { applyTestSchema, onlyTheseVenues, seedScene3 } = await import('./scene3');
const { supabaseDeps } = await import('@/features/demand/server/wiring');
const { runPipeline } = await import('@/features/demand/server/pipeline');
const { reviseRouteDeps } = await import('@/features/demand/server/route-deps');
const { handleRevise } = await import('@/features/demand/server/revise-route');

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof NextServer>()),
  after: (task: () => unknown) => task(),
}));

const db = (client: unknown) => client as SupabaseClient;
const admin = adminClient() as unknown as SupabaseClient;
let world: Awaited<ReturnType<typeof seedScene3>>;
let restoreVenues: (() => Promise<void>) | undefined;
let potteryId: string;

async function clearDemandTables(): Promise<void> {
  await admin.from('event_proposals').delete().not('id', 'is', null);
  await admin.from('opportunity_runs').delete().not('id', 'is', null);
}

const post = (id: string, body: unknown) => new Request(`http://test/api/ai/proposals/${id}/revise`, { method: 'POST', body: JSON.stringify(body) });

beforeAll(async () => {
  applyTestSchema();
  await cleanupTestUsers(admin as never);
  await clearDemandTables();
  world = await seedScene3(admin);
  restoreVenues = await onlyTheseVenues(admin, [...world.owners.values()].map((o) => o.businessId));
  await runPipeline(supabaseDeps(admin), { triggeredBy: 'manual' });
  const owner = world.owners.get('Kiln & Cup')!;
  // Kiln also hosts food_drink, so it can get more than one proposal; take the Scene 3 pottery one.
  const { data } = await admin.from('event_proposals').select('id').eq('business_id', owner.businessId).eq('status', 'pending')
    .eq('proposal->>category', 'creative').eq('proposal->>suggestedSlot', 'thu_eve').single();
  potteryId = (data as { id: string }).id;
}, 120_000);

afterAll(async () => {
  await restoreVenues?.();
  await clearDemandTables();
  await cleanupTestUsers(admin as never);
});

describe('ws04 revise against local Supabase (MOCK_AI)', () => {
  it('hides the proposal from another business owner', async () => {
    const other = world.owners.get('Meeple House')!;
    const ctx = { user: { id: other.id }, supabase: db(other.client) };
    const error = await handleRevise(ctx, potteryId, post(potteryId, { note: 'x' }), reviseRouteDeps()).catch((e: unknown) => e);
    expect((error as { code?: string }).code).toBe('NOT_FOUND');
  });

  it('stores a new pending version for the owner and expires the old one', async () => {
    const owner = world.owners.get('Kiln & Cup')!;
    const ctx = { user: { id: owner.id }, supabase: db(owner.client) };
    const res = await handleRevise(ctx, potteryId, post(potteryId, { note: 'Smaller group please', capacity: 8, priceCents: 2500 }), reviseRouteDeps());
    expect(res.status).toBe(201);
    const { data } = (await res.json()) as { data: { proposalId: string; revision: number } };
    expect(data.revision).toBe(1);

    const { data: rows } = await db(owner.client).from('event_proposals').select('id, status, supersedes_id, revision, proposal').in('id', [potteryId, data.proposalId]);
    const byId = new Map((rows ?? []).map((r) => [r.id as string, r]));
    expect(byId.get(potteryId)?.status).toBe('expired');
    const next = byId.get(data.proposalId)!;
    expect(next).toMatchObject({ status: 'pending', supersedes_id: potteryId, revision: 1 });
    expect(next.proposal).toMatchObject({ suggestedCapacity: 8, suggestedPriceCents: 2500, demand: { band: '6-9' } });
  });

  it('refuses to revise the superseded version', async () => {
    const owner = world.owners.get('Kiln & Cup')!;
    const ctx = { user: { id: owner.id }, supabase: db(owner.client) };
    const error = await handleRevise(ctx, potteryId, post(potteryId, { note: 'again' }), reviseRouteDeps()).catch((e: unknown) => e);
    expect((error as { code?: string }).code).toBe('CONFLICT');
  });
});
