import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { adminClient, createTestUser, type TestUser } from '../helpers';
import { actAs, call, cleanupSocialUsers, setProfile, setTestOrigin } from './support';

/**
 * Blocking is the strongest thing a member can do about another member, so it has to take effect
 * the moment they do it — on every surface, not when a cache happens to expire. Match lists and
 * graph snapshots are both cached per viewer, and a block has to reach both, in both directions.
 */

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', async () => {
  const support = await import('./support');
  return { createServerClient: async () => support.session.client };
});

const { GET: getMatches } = await import('@/app/api/matches/route');
const { GET: getGraph } = await import('@/app/api/graph/route');
const { POST: block } = await import('@/app/api/users/[id]/block/route');

setTestOrigin('block-propagation');
const admin = adminClient();
let blocker: TestUser;
let blocked: TestUser;
let bystander: TestUser;

async function graphNodeIds(user: TestUser): Promise<string[]> {
  actAs(user);
  const res = await call(getGraph, { path: '/api/graph' });
  expect(res.status).toBe(200);
  return (res.body.data as { nodes: Array<{ id: string }> }).nodes.map((node) => node.id);
}

async function matchIds(user: TestUser): Promise<string[]> {
  actAs(user);
  const res = await call(getMatches, { path: '/api/matches' });
  expect(res.status).toBe(200);
  return (res.body.data as Array<{ user: { id: string } }>).map((card) => card.user.id);
}

beforeAll(async () => {
  [blocker, blocked, bystander] = await Promise.all([
    createTestUser(admin, 'block-blocker'),
    createTestUser(admin, 'block-blocked'),
    createTestUser(admin, 'block-bystander'),
  ]);
  const prefs = { interests: ['pottery', 'coffee'], categories: ['creative'], slots: ['thu_eve'] };
  await Promise.all([
    setProfile(admin, blocker, prefs, { matching: true }),
    setProfile(admin, blocked, prefs, { matching: true }),
    setProfile(admin, bystander, prefs, { matching: true }),
  ]);
  // The two are connected, so each sits in the other's graph as a tie rather than a suggestion.
  const { error } = await admin.from('connections').insert({
    requester_id: blocker.id,
    recipient_id: blocked.id,
    status: 'accepted',
    responded_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  await admin.rpc('graph_backfill');
}, 60_000);

afterAll(async () => {
  await cleanupSocialUsers(admin);
});

describe('blocking someone', () => {
  it('takes them off both people’s graphs at once, not when a cache expires', async () => {
    // Warm both snapshots so the block has a cache to beat.
    expect(await graphNodeIds(blocker)).toContain(blocked.id);
    expect(await graphNodeIds(blocked)).toContain(blocker.id);

    actAs(blocker);
    const res = await call(block, {
      method: 'POST',
      path: `/api/users/${blocked.id}/block`,
      params: { id: blocked.id },
    });
    expect(res.status).toBe(200);

    expect(await graphNodeIds(blocker)).not.toContain(blocked.id);
    expect(await graphNodeIds(blocked)).not.toContain(blocker.id);
  });

  it('keeps them out of each other’s match lists', async () => {
    expect(await matchIds(blocker)).not.toContain(blocked.id);
    expect(await matchIds(blocked)).not.toContain(blocker.id);
  });

  it('leaves everyone else where they were', async () => {
    const seen = await graphNodeIds(bystander);
    expect(seen).toContain(bystander.id);
    expect(await matchIds(bystander)).toEqual(expect.arrayContaining([blocker.id]));
  });
});
