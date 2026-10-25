import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { adminClient, createTestUser, type TestUser } from '../helpers';
import { actAs, call, cleanupSocialUsers, setProfile, setTestOrigin } from '../social/support';

/**
 * `GET /api/graph` (specs §5–§6): a viewer gets their own ego network and nothing else — no
 * blocked person in it, no stranger's ties, and no suggestions without consent to matching.
 */

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', async () => {
  const support = await import('../social/support');
  return { createServerClient: async () => support.session.client };
});

const { GET: getGraph } = await import('@/app/api/graph/route');
const { invalidateGraph } = await import('@/features/graph/server/snapshot');
const { invalidateMatches } = await import('@/features/matching/server/matches');

setTestOrigin('graph-snapshot');
const admin = adminClient();
let viewer: TestUser;
let friend: TestUser;
let blocked: TestUser;
let stranger: TestUser;

type Snapshot = {
  me: string;
  nodes: Array<{
    id: string;
    kind: string;
    state: string;
    label: string;
    avatarUrl: string | null;
  }>;
  edges: Array<{ source: string; target: string; state: string; why: string | null }>;
  stats: Record<string, number>;
};

async function graphOf(user: TestUser, path = '/api/graph'): Promise<Snapshot> {
  invalidateGraph(user.id);
  actAs(user);
  const res = await call(getGraph, { path });
  expect(res.status).toBe(200);
  return res.body.data as Snapshot;
}

beforeAll(async () => {
  [viewer, friend, blocked, stranger] = await Promise.all([
    createTestUser(admin, 'graph-viewer'),
    createTestUser(admin, 'graph-friend'),
    createTestUser(admin, 'graph-blocked'),
    createTestUser(admin, 'graph-stranger'),
  ]);
  await Promise.all([
    setProfile(admin, viewer),
    setProfile(admin, friend),
    setProfile(admin, blocked),
    setProfile(admin, stranger),
  ]);
  const connect = async (a: TestUser, b: TestUser, status: 'accepted' | 'pending') => {
    const { error } = await admin.from('connections').insert({
      requester_id: a.id,
      recipient_id: b.id,
      status,
      responded_at: status === 'accepted' ? new Date().toISOString() : null,
    });
    if (error) throw new Error(error.message);
  };
  await connect(viewer, friend, 'accepted');
  await connect(viewer, blocked, 'accepted');
  await connect(stranger, friend, 'accepted');
  await admin.from('blocks').insert({ blocker_id: blocked.id, blocked_id: viewer.id });
  await admin.rpc('graph_backfill');
  invalidateMatches(viewer.id, friend.id, stranger.id);
}, 60_000);

afterAll(async () => {
  await cleanupSocialUsers(admin);
});

describe('GET /api/graph', () => {
  it('centres the graph on the viewer and draws their connection', async () => {
    const snapshot = await graphOf(viewer);
    expect(snapshot.me).toBe(viewer.id);
    const me = snapshot.nodes.find((node) => node.id === viewer.id);
    expect(me).toMatchObject({ kind: 'me', state: 'me', label: 'Test graph-viewer' });
    const theirNode = snapshot.nodes.find((node) => node.id === friend.id);
    expect(theirNode).toMatchObject({ kind: 'person', state: 'connected' });
    const edge = snapshot.edges.find((item) => item.target === friend.id);
    expect(edge).toMatchObject({ source: viewer.id, state: 'connected' });
    // The provenance backfill supplies the "why" without anyone writing it by hand.
    expect(edge?.why).toBeTruthy();
  });

  it('leaves out a person who blocked the viewer, and does not count them', async () => {
    const snapshot = await graphOf(viewer);
    expect(snapshot.nodes.some((node) => node.id === blocked.id)).toBe(false);
    expect(snapshot.edges.some((edge) => edge.target === blocked.id)).toBe(false);
    expect(snapshot.stats.connected).toBe(1);
  });

  it('never leaks a tie the viewer is not part of', async () => {
    const snapshot = await graphOf(viewer);
    // The stranger is connected to the viewer's friend. That tie is theirs, not the viewer's.
    expect(
      snapshot.edges.some(
        (edge) =>
          (edge.source === stranger.id && edge.target === friend.id) ||
          (edge.source === friend.id && edge.target === stranger.id),
      ),
    ).toBe(false);
    // They may still appear as someone the agent suggests, which is the matcher's call, and
    // then only on an edge from the viewer.
    for (const edge of snapshot.edges.filter(
      (item) => item.source === stranger.id || item.target === stranger.id,
    )) {
      expect(edge).toMatchObject({ source: viewer.id, state: 'suggested' });
    }
    expect(
      snapshot.nodes.some((node) => node.id === stranger.id && node.state === 'connected'),
    ).toBe(false);
  });

  it('carries a profile picture into the node when there is one', async () => {
    const picture = 'https://cdn.example.test/avatar.png';
    await admin.from('profiles').update({ avatar_url: picture }).eq('id', friend.id);
    const snapshot = await graphOf(viewer);
    expect(snapshot.nodes.find((node) => node.id === friend.id)?.avatarUrl).toBe(picture);
    await admin.from('profiles').update({ avatar_url: null }).eq('id', friend.id);
  });

  it('offers no agent suggestions to someone who has not consented to matching', async () => {
    const quiet = await createTestUser(admin, 'graph-quiet');
    await setProfile(admin, quiet, {}, { matching: false });
    const snapshot = await graphOf(quiet);
    expect(snapshot.stats.suggested).toBe(0);
    expect(snapshot.nodes.every((node) => node.state !== 'suggested')).toBe(true);
  });

  it('can be asked for existing ties only', async () => {
    const withAgent = await graphOf(viewer);
    const tiesOnly = await graphOf(viewer, '/api/graph?suggestions=0');
    expect(tiesOnly.stats.suggested).toBe(0);
    expect(tiesOnly.nodes.length).toBeLessThanOrEqual(withAgent.nodes.length);
  });

  it('rejects a query it does not understand', async () => {
    actAs(viewer);
    const res = await call(getGraph, { path: '/api/graph?suggestions=maybe' });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION');
  });
});
