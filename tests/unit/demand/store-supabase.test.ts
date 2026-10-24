import { describe, expect, it, vi } from 'vitest';
import type { AggregatedCluster } from '@/features/demand/server/aggregate';
import { EMPTY_STATS } from '@/features/demand/schemas';
import { fakeClient } from './fake-supabase';

vi.mock('server-only', () => ({}));

const store = await import('@/features/demand/server/store-supabase');

const CLUSTER = {
  signature: 'creative|thu_eve|37.76,-122.42', category: 'creative', slot: 'thu_eve', geocell: '37.76,-122.42',
  center: { lat: 37.76, lng: -122.42 }, members: [{ userId: 'u1' }, { userId: 'u2' }, { userId: 'u3' }, { userId: 'u4' }],
  memberCount: 4, band: '4-5', topInterests: [{ tag: 'pottery', count: 3 }], groupSizeMode: 'small', budgetP50Cents: 2000,
  activityPrefs: [], neighborhoodLabel: 'Mission District', rankScore: 3,
} as unknown as AggregatedCluster;

describe('store-supabase', () => {
  it('startRun returns the run id, or null when the lock is held', async () => {
    const held = fakeClient({ data: 'run-1', error: null }, { data: null, error: null });
    expect(await store.startRun(held.client, 'manual')).toBe('run-1');
    expect(await store.startRun(held.client, 'cron')).toBeNull();
    expect(held.rpc).toHaveBeenCalledWith('start_opportunity_run', { trigger_source: 'cron' });
    await expect(store.startRun(fakeClient({ data: null, error: { message: 'x' } }).client, 'manual')).rejects.toThrow('start run failed');
  });

  it('runUpdater writes the full stats object with the latest stage', async () => {
    const { client, calls } = fakeClient({ data: null, error: null });
    const update = store.runUpdater(client);
    await update('r1', { stage: 'clustering', stats: { ...EMPTY_STATS, usersConsidered: 13 } });
    await update('r1', { status: 'completed', stage: 'done', finished: true });
    const rows = calls.filter(([n]) => n === 'update').map(([, a]) => a[0] as Record<string, unknown>);
    expect(rows[0]).toEqual({ stats: { ...EMPTY_STATS, usersConsidered: 13, stage: 'clustering' } });
    expect(rows[1]).toMatchObject({ status: 'completed', stats: { usersConsidered: 13, stage: 'done' } });
    expect(rows[1]).toHaveProperty('finished_at');
    await expect(store.runUpdater(fakeClient({ data: null, error: { message: 'x' } }).client)('r1', { error: 'boom' })).rejects.toThrow('update run failed');
  });

  it('lists eligible users and checks the dedup window', async () => {
    expect(await store.listEligibleUserIds(fakeClient({ data: [{ id: 'a' }, { id: 'b' }], error: null }).client)).toEqual(['a', 'b']);
    expect(await store.hasRecentPendingProposal(fakeClient({ data: [{ id: 'p' }], error: null }).client, 'sig', new Date())).toBe(true);
    expect(await store.hasRecentPendingProposal(fakeClient({ data: [], error: null }).client, 'sig', new Date())).toBe(false);
    await expect(store.listEligibleUserIds(fakeClient({ data: null, error: { message: 'x' } }).client)).rejects.toThrow('eligible users');
  });

  it('saves cluster, member ids and proposal through one RPC', async () => {
    const { client, rpc } = fakeClient({ data: 'p-1', error: null });
    const id = await store.saveProposal(client, { runId: 'r1', cluster: CLUSTER, venue: { match: { businessId: 'b1' } } as never, proposal: { title: 't' } as never });
    expect(id).toBe('p-1');
    const args = rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(args['p_member_ids']).toEqual(['u1', 'u2', 'u3', 'u4']);
    expect(args['p_cluster']).toMatchObject({ signature: CLUSTER.signature, center_lat: 37.76, top_interests: CLUSTER.topInterests });
    expect(args['p_cluster']).not.toHaveProperty('members');
  });

  it('getRunView shows bands and venue names, never raw counts', async () => {
    const { client } = fakeClient(
      { data: { status: 'completed', stats: { ...EMPTY_STATS, proposalsCreated: 1, stage: 'done' } }, error: null },
      { data: [{ id: 'p1', status: 'pending', business_id: 'b1', proposal: { title: 'Pottery', category: 'creative', suggestedSlot: 'thu_eve', demand: { band: '6-9', neighborhoodLabel: 'Mission District' } } }], error: null },
      { data: [{ id: 'b1', name: 'Kiln & Cup' }], error: null },
    );
    const view = await store.getRunView(client, 'r1');
    expect(view).toEqual({
      status: 'completed', stage: 'done', stats: { ...EMPTY_STATS, proposalsCreated: 1 },
      proposals: [{ id: 'p1', title: 'Pottery', businessName: 'Kiln & Cup', demandBand: '6-9', status: 'pending', category: 'creative', slot: 'thu_eve', neighborhood: 'Mission District' }],
    });
    expect(await store.getRunView(fakeClient({ data: null, error: null }).client, 'r1')).toBeNull();
  });
});
