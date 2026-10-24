import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { adminClient, createTestUser, type TestUser } from '../helpers';
import { actAs, call, cleanupSocialUsers, setProfile, setTestOrigin } from './support';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', async () => {
  const support = await import('./support');
  return { createServerClient: async () => support.session.client };
});

const { GET: list, POST: send } = await import('@/app/api/connections/[id]/messages/route');

setTestOrigin('messages');
const admin = adminClient();
let alice: TestUser, bob: TestUser, carol: TestUser, dave: TestUser;
let acceptedId: string, pendingId: string;

beforeAll(async () => {
  [alice, bob, carol, dave] = await Promise.all([
    createTestUser(admin, 'dm-alice'),
    createTestUser(admin, 'dm-bob'),
    createTestUser(admin, 'dm-carol'),
    createTestUser(admin, 'dm-dave'),
  ]);
  await Promise.all([alice, bob, carol, dave].map((u) => setProfile(admin, u)));
  const accepted = await admin.from('connections').insert({ requester_id: alice.id, recipient_id: bob.id, status: 'accepted' }).select('id').single();
  const pending = await admin.from('connections').insert({ requester_id: alice.id, recipient_id: carol.id }).select('id').single();
  acceptedId = accepted.data!.id;
  pendingId = pending.data!.id;
}, 60_000);

afterAll(async () => {
  await cleanupSocialUsers(admin);
});

describe('direct messages between accepted connections (P1)', () => {
  it('lets either side send and read, oldest first, with their own messages marked', async () => {
    actAs(alice);
    const first = await call(send, { method: 'POST', params: { id: acceptedId }, body: { body: 'Pottery Thursday?' } });
    expect(first.status).toBe(201);
    actAs(bob);
    await call(send, { method: 'POST', params: { id: acceptedId }, body: { body: 'Yes! 7pm?' } });
    const thread = await call(list, { path: `/api/connections/${acceptedId}/messages`, params: { id: acceptedId } });
    expect(thread.body.data.map((m: { body: string; mine: boolean }) => [m.body, m.mine])).toEqual([
      ['Pottery Thursday?', false],
      ['Yes! 7pm?', true],
    ]);
  });

  it('returns only newer messages when polling with after', async () => {
    actAs(alice);
    const all = await call(list, { path: `/api/connections/${acceptedId}/messages`, params: { id: acceptedId } });
    const last = all.body.data.at(-1).createdAt;
    expect((await call(list, { path: `/api/connections/${acceptedId}/messages?after=${encodeURIComponent(last)}`, params: { id: acceptedId } })).body.data).toEqual([]);
    await call(send, { method: 'POST', params: { id: acceptedId }, body: { body: 'See you there' } });
    const newer = await call(list, { path: `/api/connections/${acceptedId}/messages?after=${encodeURIComponent(last)}`, params: { id: acceptedId } });
    expect(newer.body.data.map((m: { body: string }) => m.body)).toEqual(['See you there']);
  });

  it('refuses outsiders, pending connections and invalid bodies', async () => {
    actAs(dave);
    expect((await call(send, { method: 'POST', params: { id: acceptedId }, body: { body: 'hi' } })).status).toBe(404);
    expect((await call(list, { path: `/api/connections/${acceptedId}/messages`, params: { id: acceptedId } })).status).toBe(404);
    const direct = await dave.client.from('direct_messages').insert({ connection_id: acceptedId, sender_id: dave.id, body: 'sneaky' });
    expect(direct.error).not.toBeNull();
    actAs(alice);
    expect((await call(send, { method: 'POST', params: { id: pendingId }, body: { body: 'hi' } })).status).toBe(403);
    expect((await call(send, { method: 'POST', params: { id: acceptedId }, body: { body: '   ' } })).status).toBe(400);
    expect((await call(send, { method: 'POST', params: { id: acceptedId }, body: { body: 'x'.repeat(1001) } })).status).toBe(400);
  });

  it('hides the conversation from both sides after a block', async () => {
    await admin.rpc('block_user', { p_blocker: alice.id, p_blocked: bob.id });
    actAs(bob);
    expect((await call(list, { path: `/api/connections/${acceptedId}/messages`, params: { id: acceptedId } })).status).toBe(403);
    const direct = await bob.client.from('direct_messages').select('id').eq('connection_id', acceptedId);
    expect(direct.data).toEqual([]);
  });
});
