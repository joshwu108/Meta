import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { adminClient, createTestUser, type TestUser } from '../helpers';
import { actAs, call, cleanupSocialUsers, setProfile, setTestOrigin } from './support';

/**
 * Turning off `allow_matching` is the switch that decides whether a member's preferences reach
 * anyone else's agent at all (README §3, invariant 3). `getSharablePreferences` is the gate, but
 * match lists are cached per viewer for five minutes *above* that gate, so revoking consent has
 * to reach the cache too — otherwise the member stays on other people's screens, with their name
 * and an explanation derived from the preferences they just withdrew, until the entry expires.
 */

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', async () => {
  const support = await import('./support');
  return { createServerClient: async () => support.session.client };
});

const { GET: getMatches } = await import('@/app/api/matches/route');
const { PATCH: patchPermissions } = await import('@/app/api/agent/permissions/route');
const { GET: getGraph } = await import('@/app/api/graph/route');

setTestOrigin('consent-revocation');
const admin = adminClient();
let viewer: TestUser;
let willRevoke: TestUser;
let stays: TestUser;

const matchIds = async (user: TestUser): Promise<string[]> => {
  actAs(user);
  const res = await call(getMatches, { path: '/api/matches' });
  expect(res.status).toBe(200);
  return (res.body.data as Array<{ user: { id: string } }>).map((card) => card.user.id);
};

beforeAll(async () => {
  [viewer, willRevoke, stays] = await Promise.all([
    createTestUser(admin, 'revoke-viewer'),
    createTestUser(admin, 'revoke-leaver'),
    createTestUser(admin, 'revoke-stayer'),
  ]);
  // Same interests and free evenings, so both candidates rank for the viewer.
  const prefs = { interests: ['pottery', 'coffee'], categories: ['creative'], slots: ['thu_eve'] };
  await Promise.all([
    setProfile(admin, viewer, prefs, { matching: true }),
    setProfile(admin, willRevoke, prefs, { matching: true }),
    setProfile(admin, stays, prefs, { matching: true }),
  ]);
}, 60_000);

afterAll(async () => {
  await cleanupSocialUsers(admin);
});

describe('withdrawing consent to matching', () => {
  it('takes the member off other people’s match lists at once, not when a cache expires', async () => {
    const before = await matchIds(viewer);
    expect(before, 'both candidates start out visible').toEqual(
      expect.arrayContaining([willRevoke.id, stays.id]),
    );

    // The member turns the switch off through the product's own route.
    actAs(willRevoke);
    const patched = await call(patchPermissions, {
      method: 'PATCH',
      path: '/api/agent/permissions',
      body: { allow_matching: false },
    });
    expect(patched.status).toBe(200);

    const after = await matchIds(viewer);
    expect(after).not.toContain(willRevoke.id);
    expect(after, 'the other candidate is unaffected').toContain(stays.id);
  });

  it('keeps them out of the agent’s suggestions on the graph too', async () => {
    actAs(viewer);
    const res = await call(getGraph, { path: '/api/graph' });
    expect(res.status).toBe(200);
    const nodes = (res.body.data as { nodes: Array<{ id: string; state: string }> }).nodes;
    expect(nodes.some((node) => node.id === willRevoke.id)).toBe(false);
  });

  it('lets them back on when they turn it on again', async () => {
    actAs(willRevoke);
    const patched = await call(patchPermissions, {
      method: 'PATCH',
      path: '/api/agent/permissions',
      body: { allow_matching: true },
    });
    expect(patched.status).toBe(200);
    expect(await matchIds(viewer)).toContain(willRevoke.id);
  });
});
