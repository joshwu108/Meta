import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, createTestUser, type TestUser } from '../helpers';
import { cleanupSocialUsers } from '../social/support';

/**
 * Workstream 07 §3 and §5: `graph_edge_events` is readable only by the two people it is about,
 * never across a block, and is writable only with the service role.
 */

const admin = adminClient();
let alice: TestUser;
let bob: TestUser;
let carol: TestUser;

const record = async (
  actorId: string,
  subjectId: string,
  kind: string,
  refId: string | null = null,
) => {
  const { data, error } = await admin
    .from('graph_edge_events')
    .insert({ actor_id: actorId, subject_id: subjectId, kind, source: 'user', ref_id: refId })
    .select('id, pair_lo, pair_hi, weight, metadata')
    .single();
  if (error) throw new Error(error.message);
  return data;
};

beforeAll(async () => {
  [alice, bob, carol] = await Promise.all([
    createTestUser(admin, 'graph-alice'),
    createTestUser(admin, 'graph-bob'),
    createTestUser(admin, 'graph-carol'),
  ]);
  await admin
    .from('profiles')
    .update({ is_discoverable: true })
    .in('id', [alice.id, bob.id, carol.id]);
});

afterAll(async () => {
  await cleanupSocialUsers(admin);
});

describe('graph_edge_events', () => {
  it('normalizes the pair into pair_lo/pair_hi whichever side acted', async () => {
    const forward = await record(alice.id, bob.id, 'request_sent');
    const [lo, hi] = [alice.id, bob.id].sort();
    expect(forward.pair_lo).toBe(lo);
    expect(forward.pair_hi).toBe(hi);
    const reverse = await record(bob.id, alice.id, 'accepted');
    expect(reverse.pair_lo).toBe(lo);
    expect(reverse.pair_hi).toBe(hi);
  });

  it('is readable by both sides of the pair and by nobody else', async () => {
    await record(alice.id, bob.id, 'message_exchanged');
    const asAlice = await alice.client
      .from('graph_edge_events')
      .select('id')
      .eq('actor_id', alice.id)
      .eq('subject_id', bob.id);
    expect(asAlice.error).toBeNull();
    expect(asAlice.data?.length ?? 0).toBeGreaterThan(0);

    const asBob = await bob.client
      .from('graph_edge_events')
      .select('id')
      .eq('actor_id', alice.id)
      .eq('subject_id', bob.id);
    expect(asBob.data?.length ?? 0).toBeGreaterThan(0);

    const asCarol = await carol.client
      .from('graph_edge_events')
      .select('id')
      .eq('actor_id', alice.id)
      .eq('subject_id', bob.id);
    expect(asCarol.error).toBeNull();
    expect(asCarol.data).toEqual([]);
  });

  it('hides a pair once either side blocks the other', async () => {
    await record(alice.id, carol.id, 'request_sent');
    const before = await alice.client
      .from('graph_edge_events')
      .select('id')
      .eq('subject_id', carol.id);
    expect(before.data?.length ?? 0).toBeGreaterThan(0);

    const blocked = await admin.rpc('block_user', { p_blocker: carol.id, p_blocked: alice.id });
    expect(blocked.error).toBeNull();

    const afterAlice = await alice.client
      .from('graph_edge_events')
      .select('id')
      .eq('subject_id', carol.id);
    expect(afterAlice.data).toEqual([]);
    const afterCarol = await carol.client
      .from('graph_edge_events')
      .select('id')
      .eq('actor_id', alice.id);
    expect(afterCarol.data).toEqual([]);

    await admin.from('blocks').delete().eq('blocker_id', carol.id).eq('blocked_id', alice.id);
  });

  it('refuses writes from a signed-in user, in either direction', async () => {
    const own = await alice.client
      .from('graph_edge_events')
      .insert({ actor_id: alice.id, subject_id: bob.id, kind: 'accepted', source: 'user' });
    expect(own.error).not.toBeNull();
    const spoof = await alice.client
      .from('graph_edge_events')
      .insert({ actor_id: bob.id, subject_id: carol.id, kind: 'accepted', source: 'user' });
    expect(spoof.error).not.toBeNull();
    const update = await alice.client
      .from('graph_edge_events')
      .update({ weight: 1 })
      .eq('actor_id', alice.id)
      .select();
    expect(update.data ?? []).toEqual([]);
    const remove = await alice.client
      .from('graph_edge_events')
      .delete()
      .eq('actor_id', alice.id)
      .select();
    expect(remove.data ?? []).toEqual([]);
  });

  it('rejects a self edge, an unknown kind and an out-of-range weight', async () => {
    const self = await admin
      .from('graph_edge_events')
      .insert({ actor_id: alice.id, subject_id: alice.id, kind: 'accepted', source: 'user' });
    expect(self.error).not.toBeNull();
    const kind = await admin
      .from('graph_edge_events')
      .insert({ actor_id: alice.id, subject_id: bob.id, kind: 'befriended', source: 'user' });
    expect(kind.error).not.toBeNull();
    const weight = await admin.from('graph_edge_events').insert({
      actor_id: alice.id,
      subject_id: bob.id,
      kind: 'accepted',
      source: 'user',
      weight: 2,
    });
    expect(weight.error).not.toBeNull();
  });

  it('defaults weight and metadata so a write hook can state only the facts', async () => {
    const row = await record(bob.id, carol.id, 'group_joined');
    expect(Number(row.weight)).toBe(0.1);
    expect(row.metadata).toEqual({});
  });

  it('backfills a connection that predates the log, and stays idempotent', async () => {
    const { data: connection, error } = await admin
      .from('connections')
      .insert({
        requester_id: bob.id,
        recipient_id: carol.id,
        status: 'accepted',
        responded_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    expect(error).toBeNull();

    const first = await admin.rpc('graph_backfill');
    expect(first.error).toBeNull();
    expect(Number(first.data)).toBeGreaterThanOrEqual(2);

    const { data: rows } = await admin
      .from('graph_edge_events')
      .select('kind, actor_id, subject_id, weight, metadata')
      .eq('ref_id', connection!.id)
      .order('kind');
    const kinds = (rows ?? []).map((row) => row.kind);
    expect(kinds).toContain('request_sent');
    expect(kinds).toContain('accepted');
    // The requester sent it; the recipient answered it.
    const sent = (rows ?? []).find((row) => row.kind === 'request_sent');
    const accepted = (rows ?? []).find((row) => row.kind === 'accepted');
    expect(sent).toMatchObject({
      actor_id: bob.id,
      subject_id: carol.id,
      metadata: { backfilled: true },
    });
    expect(accepted).toMatchObject({ actor_id: carol.id, subject_id: bob.id });

    const second = await admin.rpc('graph_backfill');
    expect(Number(second.data)).toBe(0);

    await admin.from('connections').delete().eq('id', connection!.id);
  });

  it('is not callable by a signed-in user', async () => {
    const { error } = await alice.client.rpc('graph_backfill');
    expect(error).not.toBeNull();
  });
});
