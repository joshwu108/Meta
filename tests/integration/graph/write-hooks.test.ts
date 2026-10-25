import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { adminClient, createTestUser, type TestUser } from '../helpers';
import { actAs, call, cleanupSocialUsers, setProfile, setTestOrigin } from '../social/support';

/**
 * Workstream 07 §10: every social action that changes the graph leaves provenance behind, and a
 * failure to record never reaches the caller. Driven through the real routes under real RLS.
 */

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', async () => {
  const support = await import('../social/support');
  return { createServerClient: async () => support.session.client };
});

const { POST: createConnection } = await import('@/app/api/connections/route');
const { PATCH: respondConnection } = await import('@/app/api/connections/[id]/route');
const { POST: sendMessage } = await import('@/app/api/connections/[id]/messages/route');
const { GET: getMatches } = await import('@/app/api/matches/route');
const { PATCH: respondInvitation } = await import('@/app/api/invitations/[id]/route');
const { invalidateMatches } = await import('@/features/matching/server/matches');

setTestOrigin('graph-write-hooks');
const admin = adminClient();
let alice: TestUser;
let bob: TestUser;
let carol: TestUser;

/** Provenance rows for a pair, newest first. */
async function events(a: string, b: string) {
  const lo = a < b ? a : b;
  const hi = a < b ? b : a;
  const { data, error } = await admin
    .from('graph_edge_events')
    .select('kind, actor_id, subject_id, source, ref_table, ref_id, weight')
    .eq('pair_lo', lo)
    .eq('pair_hi', hi)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

beforeAll(async () => {
  [alice, bob, carol] = await Promise.all([
    createTestUser(admin, 'hook-alice'),
    createTestUser(admin, 'hook-bob'),
    createTestUser(admin, 'hook-carol'),
  ]);
  await Promise.all([setProfile(admin, alice), setProfile(admin, bob), setProfile(admin, carol)]);
}, 60_000);

afterAll(async () => {
  await cleanupSocialUsers(admin);
});

describe('connection requests', () => {
  it('records request_sent by the requester and accepted by the recipient', async () => {
    actAs(alice);
    const created = await call(createConnection, {
      method: 'POST',
      path: '/api/connections',
      body: { recipientId: bob.id, message: 'hi' },
    });
    expect(created.status).toBe(201);
    const connectionId = created.body.data.id as string;

    const afterRequest = await events(alice.id, bob.id);
    expect(afterRequest).toHaveLength(1);
    expect(afterRequest[0]).toMatchObject({
      kind: 'request_sent',
      actor_id: alice.id,
      subject_id: bob.id,
      source: 'user',
      ref_table: 'connections',
      ref_id: connectionId,
    });

    actAs(bob);
    const answered = await call(respondConnection, {
      method: 'PATCH',
      path: `/api/connections/${connectionId}`,
      body: { status: 'accepted' },
      params: { id: connectionId },
    });
    expect(answered.status).toBe(200);

    const rows = await events(alice.id, bob.id);
    expect(rows.map((row) => row.kind).sort()).toEqual(['accepted', 'request_sent']);
    const accepted = rows.find((row) => row.kind === 'accepted');
    expect(accepted).toMatchObject({
      actor_id: bob.id,
      subject_id: alice.id,
      ref_id: connectionId,
    });
    // Accepting says more about a pair than requesting.
    expect(Number(accepted!.weight)).toBeGreaterThan(
      Number(rows.find((row) => row.kind === 'request_sent')!.weight),
    );
  });

  it('records a decline without giving the edge any strength', async () => {
    actAs(alice);
    const created = await call(createConnection, {
      method: 'POST',
      path: '/api/connections',
      body: { recipientId: carol.id },
    });
    const connectionId = created.body.data.id as string;
    actAs(carol);
    await call(respondConnection, {
      method: 'PATCH',
      path: `/api/connections/${connectionId}`,
      body: { status: 'declined' },
      params: { id: connectionId },
    });
    const declined = (await events(alice.id, carol.id)).find((row) => row.kind === 'declined');
    expect(declined).toMatchObject({ actor_id: carol.id, subject_id: alice.id });
    expect(Number(declined!.weight)).toBe(0);
  });
});

describe('direct messages', () => {
  it('records one message_exchanged per sender per day, not one per message', async () => {
    const { data: connection } = await admin
      .from('connections')
      .select('id')
      .eq('requester_id', alice.id)
      .eq('recipient_id', bob.id)
      .single();
    const connectionId = connection!.id;

    actAs(alice);
    for (const body of ['first', 'second', 'third']) {
      const sent = await call(sendMessage, {
        method: 'POST',
        path: `/api/connections/${connectionId}/messages`,
        body: { body },
        params: { id: connectionId },
      });
      expect(sent.status).toBe(201);
    }
    const mine = (await events(alice.id, bob.id)).filter(
      (row) => row.kind === 'message_exchanged' && row.actor_id === alice.id,
    );
    expect(mine).toHaveLength(1);

    // The other side telling the same pair's story is its own event.
    actAs(bob);
    await call(sendMessage, {
      method: 'POST',
      path: `/api/connections/${connectionId}/messages`,
      body: { body: 'reply' },
      params: { id: connectionId },
    });
    const both = (await events(alice.id, bob.id)).filter((row) => row.kind === 'message_exchanged');
    expect(both.map((row) => row.actor_id).sort()).toEqual([alice.id, bob.id].sort());
  });
});

describe('group invitations', () => {
  it('records group_joined against the person who invited you', async () => {
    const { data: groupId, error } = await admin.rpc('create_group_with_owner', {
      p_creator: bob.id,
      p_name: 'Pottery Nights',
      p_description: 'Throwing bowls',
      p_interests: ['pottery'],
      p_visibility: 'private',
    });
    expect(error).toBeNull();
    const invited = await admin.rpc('invite_to_group', {
      p_group: groupId as string,
      p_sender: bob.id,
      p_recipients: [carol.id],
    });
    expect(invited.error).toBeNull();
    const { data: invitation } = await admin
      .from('invitations')
      .select('id')
      .eq('group_id', groupId as string)
      .eq('recipient_id', carol.id)
      .single();

    actAs(carol);
    const answered = await call(respondInvitation, {
      method: 'PATCH',
      path: `/api/invitations/${invitation!.id}`,
      body: { status: 'accepted' },
      params: { id: invitation!.id },
    });
    expect(answered.status).toBe(200);

    const joined = (await events(carol.id, bob.id)).find((row) => row.kind === 'group_joined');
    expect(joined).toMatchObject({
      actor_id: carol.id,
      subject_id: bob.id,
      source: 'group',
      ref_table: 'groups',
      ref_id: groupId,
    });
  });

  it('records nothing for a declined invitation', async () => {
    const { data: groupId } = await admin.rpc('create_group_with_owner', {
      p_creator: bob.id,
      p_name: 'Board Games',
      p_description: 'Catan',
      p_interests: ['games'],
      p_visibility: 'private',
    });
    await admin.rpc('invite_to_group', {
      p_group: groupId as string,
      p_sender: bob.id,
      p_recipients: [alice.id],
    });
    const { data: invitation } = await admin
      .from('invitations')
      .select('id')
      .eq('group_id', groupId as string)
      .eq('recipient_id', alice.id)
      .single();

    actAs(alice);
    await call(respondInvitation, {
      method: 'PATCH',
      path: `/api/invitations/${invitation!.id}`,
      body: { status: 'declined' },
      params: { id: invitation!.id },
    });
    const joins = (await events(alice.id, bob.id)).filter(
      (row) => row.kind === 'group_joined' && row.ref_id === groupId,
    );
    expect(joins).toEqual([]);
  });
});

describe('agent suggestions', () => {
  it('records what the matcher put in front of the viewer, as agent-sourced', async () => {
    const stranger = await createTestUser(admin, 'hook-stranger');
    await setProfile(admin, stranger);
    invalidateMatches(stranger.id);

    actAs(stranger);
    const res = await call(getMatches, { path: '/api/matches' });
    expect(res.status).toBe(200);
    const suggested = res.body.data as Array<{ user: { id: string } }>;
    expect(suggested.length).toBeGreaterThan(0);

    const rows = await events(stranger.id, suggested[0]!.user.id);
    const agentRow = rows.find((row) => row.kind === 'agent_suggested');
    expect(agentRow).toMatchObject({ actor_id: stranger.id, source: 'agent', ref_table: null });

    // A second look at the same list is not a second introduction.
    invalidateMatches(stranger.id);
    await call(getMatches, { path: '/api/matches' });
    const again = (await events(stranger.id, suggested[0]!.user.id)).filter(
      (row) => row.kind === 'agent_suggested',
    );
    expect(again).toHaveLength(1);
  });
});

describe('failure isolation', () => {
  it('still answers the request when recording is impossible', async () => {
    const { recordGraphEvent } = await import('@/features/graph');
    // The table the recorder writes to is not reachable under this name; the action must survive.
    const spy = vi.spyOn(await import('@/lib/supabase/admin'), 'createAdminClient');
    spy.mockImplementationOnce(() => {
      throw new Error('no database');
    });
    await expect(
      recordGraphEvent({ actorId: alice.id, subjectId: bob.id, kind: 'accepted' }),
    ).resolves.toBeUndefined();
    spy.mockRestore();

    const fresh = await createTestUser(admin, 'hook-isolated');
    await setProfile(admin, fresh);
    actAs(alice);
    const created = await call(createConnection, {
      method: 'POST',
      path: '/api/connections',
      body: { recipientId: fresh.id },
    });
    expect(created.status).toBe(201);
  });
});
