import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { adminClient, cleanupTestUsers, createTestUser, type TestUser } from '../helpers';
import { actAs, call, setProfile } from './support';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', async () => {
  const support = await import('./support');
  return { createServerClient: async () => support.session.client };
});

const { GET: getMatches } = await import('@/app/api/matches/route');
const { GET: listConnections, POST: createConnection } = await import('@/app/api/connections/route');
const { PATCH: respondConnection } = await import('@/app/api/connections/[id]/route');
const { POST: block } = await import('@/app/api/users/[id]/block/route');
const { POST: report } = await import('@/app/api/users/[id]/report/route');
const { invalidateMatches } = await import('@/features/matching/server/matches');

const admin = adminClient();
const users: Record<string, TestUser> = {};
const NAMES = ['viewer', 'good', 'second', 'hidden', 'noConsent', 'blockedByViewer', 'blockerOfViewer', 'pending', 'far', 'minor', 'loner'] as const;

beforeAll(async () => {
  const created = await Promise.all(NAMES.map((name) => createTestUser(admin, `match-${name.toLowerCase()}`)));
  NAMES.forEach((name, index) => (users[name] = created[index]!));
  const u = (name: (typeof NAMES)[number]) => users[name]!;
  await Promise.all([
    setProfile(admin, u('viewer')),
    setProfile(admin, u('good')),
    setProfile(admin, u('second'), { interests: ['pottery', 'hiking'], categories: ['creative', 'outdoors'], slots: ['thu_eve', 'sat_day'] }),
    setProfile(admin, u('hidden'), {}, { matching: true }, { discoverable: false }),
    setProfile(admin, u('noConsent'), {}, { matching: false }),
    setProfile(admin, u('blockedByViewer')),
    setProfile(admin, u('blockerOfViewer')),
    setProfile(admin, u('pending')),
    setProfile(admin, u('far'), {}, { matching: true }, { lat: 65.5 }),
    setProfile(admin, u('minor'), {}, { matching: true }, { adult: false }),
    setProfile(admin, u('loner'), {}, { matching: false }, { discoverable: false }),
  ]);
  await admin.from('blocks').insert([
    { blocker_id: u('viewer').id, blocked_id: u('blockedByViewer').id },
    { blocker_id: u('blockerOfViewer').id, blocked_id: u('viewer').id },
  ]);
  await admin.from('connections').insert({ requester_id: u('viewer').id, recipient_id: u('pending').id });
}, 60_000);

afterAll(async () => {
  await cleanupTestUsers(admin);
});

const ids = (cards: Array<{ user: { id: string } }>) => cards.map((card) => card.user.id);

describe('GET /api/matches', () => {
  it('excludes non-discoverable, non-consenting, blocked, connected, distant and minor users', async () => {
    actAs(users.viewer!);
    const res = await call(getMatches, { path: '/api/matches' });
    expect(res.status).toBe(200);
    expect(ids(res.body.data)).toEqual([users.good!.id, users.second!.id]);
    expect(res.body.data[0]).toMatchObject({ score: 100, sharedSlots: ['thu_eve'], user: { displayName: 'Test match-good' } });
    expect(res.body.data[0].sharedInterests).toEqual(expect.arrayContaining(['pottery', 'coffee', 'creative']));
  });

  it('gives every card an explanation grounded in shared fields', async () => {
    actAs(users.viewer!);
    const res = await call(getMatches, { path: '/api/matches' });
    for (const card of res.body.data) {
      expect(card.explanation.toLowerCase()).toMatch(/pottery|thursday/);
    }
  });

  it('hides the viewer from people they blocked and people who blocked them', async () => {
    for (const name of ['blockedByViewer', 'blockerOfViewer'] as const) {
      actAs(users[name]!);
      const res = await call(getMatches, { path: '/api/matches' });
      expect(ids(res.body.data)).not.toContain(users.viewer!.id);
    }
  });

  it('shows nobody to a user who has not consented, and nobody sees them', async () => {
    actAs(users.loner!);
    const res = await call(getMatches, { path: '/api/matches' });
    expect(res.body.data).toEqual([]);
  });

  it('applies the interest filter and limit', async () => {
    actAs(users.viewer!);
    const hiking = await call(getMatches, { path: '/api/matches?interest=hiking' });
    expect(ids(hiking.body.data)).toEqual([users.second!.id]);
    const limited = await call(getMatches, { path: '/api/matches?limit=1' });
    expect(limited.body.data).toHaveLength(1);
    const invalid = await call(getMatches, { path: '/api/matches?limit=500' });
    expect(invalid.status).toBe(400);
  });
});

describe('connections', () => {
  it('sends a request, notifies the recipient and rejects duplicates either way', async () => {
    actAs(users.viewer!);
    const created = await call(createConnection, { method: 'POST', body: { recipientId: users.good!.id, message: 'Pottery Thursday?' } });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ status: 'pending', direction: 'outgoing', user: { id: users.good!.id } });
    const { data: notes } = await admin.from('notifications').select('type, payload').eq('user_id', users.good!.id);
    expect(notes).toEqual([expect.objectContaining({ type: 'connection_request', payload: expect.objectContaining({ title: 'Test match-viewer wants to connect', body: 'Pottery Thursday?' }) })]);

    const again = await call(createConnection, { method: 'POST', body: { recipientId: users.good!.id } });
    expect(again.status).toBe(409);
    actAs(users.good!);
    const reverse = await call(createConnection, { method: 'POST', body: { recipientId: users.viewer!.id } });
    expect(reverse.status).toBe(409);
    expect(reverse.body.error?.details).toMatchObject({ direction: 'incoming' });
  });

  it('removes the new connection from both match lists', async () => {
    invalidateMatches(users.viewer!.id);
    actAs(users.viewer!);
    expect(ids((await call(getMatches, { path: '/api/matches' })).body.data)).toEqual([users.second!.id]);
  });

  it('lets only the recipient answer, once, and notifies the requester on accept', async () => {
    const { data: edge } = await admin.from('connections').select('id').eq('requester_id', users.viewer!.id).eq('recipient_id', users.good!.id).single();
    actAs(users.viewer!);
    const byRequester = await call(respondConnection, { method: 'PATCH', body: { status: 'accepted' }, params: { id: edge!.id } });
    expect(byRequester.status).toBe(403);
    actAs(users.second!);
    const byStranger = await call(respondConnection, { method: 'PATCH', body: { status: 'accepted' }, params: { id: edge!.id } });
    expect(byStranger.status).toBe(404);

    actAs(users.good!);
    const accepted = await call(respondConnection, { method: 'PATCH', body: { status: 'accepted' }, params: { id: edge!.id } });
    expect(accepted.status).toBe(200);
    expect(accepted.body.data).toMatchObject({ status: 'accepted', direction: 'incoming', user: { id: users.viewer!.id } });
    const twice = await call(respondConnection, { method: 'PATCH', body: { status: 'declined' }, params: { id: edge!.id } });
    expect(twice.status).toBe(409);
    const { data: notes } = await admin.from('notifications').select('type').eq('user_id', users.viewer!.id).eq('type', 'connection_accepted');
    expect(notes).toHaveLength(1);
  });

  it('lists both directions with cards and filters by status', async () => {
    actAs(users.viewer!);
    const all = await call(listConnections, { path: '/api/connections' });
    expect(all.body.data.map((c: { user: { id: string } }) => c.user.id).sort()).toEqual([users.good!.id, users.pending!.id].sort());
    const accepted = await call(listConnections, { path: '/api/connections?status=accepted' });
    expect(accepted.body.data).toHaveLength(1);
    expect(accepted.body.data[0]).toMatchObject({ status: 'accepted', direction: 'outgoing', user: { displayName: 'Test match-good' } });
  });

  it('rejects self, unknown, blocked and unreachable recipients', async () => {
    actAs(users.viewer!);
    expect((await call(createConnection, { method: 'POST', body: { recipientId: users.viewer!.id } })).status).toBe(400);
    expect((await call(createConnection, { method: 'POST', body: { recipientId: crypto.randomUUID() } })).status).toBe(404);
    expect((await call(createConnection, { method: 'POST', body: { recipientId: users.blockerOfViewer!.id } })).status).toBe(404);
    expect((await call(createConnection, { method: 'POST', body: { recipientId: users.loner!.id } })).status).toBe(404);
    expect((await call(createConnection, { method: 'POST', body: { recipientId: 'not-a-uuid' } })).status).toBe(400);
  });
});

describe('block and report', () => {
  it('block declines a pending request and hides both users from each other', async () => {
    actAs(users.pending!);
    const before = await call(listConnections, { path: '/api/connections?status=pending' });
    expect(before.body.data).toHaveLength(1);
    const res = await call(block, { method: 'POST', params: { id: users.viewer!.id } });
    expect(res.status).toBe(200);
    const { data: edge } = await admin.from('connections').select('status').eq('requester_id', users.viewer!.id).eq('recipient_id', users.pending!.id).single();
    expect(edge?.status).toBe('declined');
    actAs(users.viewer!);
    const list = await call(listConnections, { path: '/api/connections' });
    expect(list.body.data.map((c: { user: { id: string } }) => c.user.id)).not.toContain(users.pending!.id);
    const repeat = await call(block, { method: 'POST', params: { id: users.second!.id } });
    expect(repeat.status).toBe(200);
    expect(ids((await call(getMatches, { path: '/api/matches' })).body.data)).not.toContain(users.second!.id);
  });

  it('rejects blocking yourself or a malformed id', async () => {
    actAs(users.viewer!);
    expect((await call(block, { method: 'POST', params: { id: users.viewer!.id } })).status).toBe(400);
    expect((await call(block, { method: 'POST', params: { id: 'nope' } })).status).toBe(404);
  });

  it('stores a report the reporter cannot read back', async () => {
    actAs(users.good!);
    const res = await call(report, { method: 'POST', params: { id: users.far!.id }, body: { reason: 'spam', details: 'Sends ads' } });
    expect(res.status).toBe(201);
    const { data } = await admin.from('reports').select('reporter_id, reason').eq('id', res.body.data.id).single();
    expect(data).toEqual({ reporter_id: users.good!.id, reason: 'spam' });
    const bad = await call(report, { method: 'POST', params: { id: users.far!.id }, body: { reason: 'boredom' } });
    expect(bad.status).toBe(400);
  });
});
