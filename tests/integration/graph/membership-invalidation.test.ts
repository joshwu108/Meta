import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { adminClient, createTestUser, type TestUser } from '../helpers';
import { actAs, call, cleanupSocialUsers, setProfile, setTestOrigin } from '../social/support';

/**
 * A graph snapshot is cached per viewer for a minute, and a group puts its roster in that
 * snapshot. Leaving a group, or being removed from one, has to reach the cache: for a private
 * group the roster is exactly what membership gates, so someone who is no longer a member should
 * not keep seeing it — even briefly, and even though it was legitimately theirs a moment ago.
 */

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', async () => {
  const support = await import('../social/support');
  return { createServerClient: async () => support.session.client };
});

const { GET: getGraph } = await import('@/app/api/graph/route');
const { DELETE: removeMember } = await import('@/app/api/groups/[id]/members/[userId]/route');
const { POST: leaveGroup } = await import('@/app/api/groups/[id]/leave/route');

setTestOrigin('membership-invalidation');
const admin = adminClient();
let owner: TestUser;
let removed: TestUser;
let leaver: TestUser;
let groupId: string;

async function graphNodeIds(user: TestUser): Promise<string[]> {
  actAs(user);
  const res = await call(getGraph, { path: '/api/graph' });
  expect(res.status).toBe(200);
  return (res.body.data as { nodes: Array<{ id: string }> }).nodes.map((node) => node.id);
}

beforeAll(async () => {
  [owner, removed, leaver] = await Promise.all([
    createTestUser(admin, 'member-owner'),
    createTestUser(admin, 'member-removed'),
    createTestUser(admin, 'member-leaver'),
  ]);
  await Promise.all([
    setProfile(admin, owner),
    setProfile(admin, removed),
    setProfile(admin, leaver),
  ]);

  const { data, error } = await admin.rpc('create_group_with_owner', {
    p_creator: owner.id,
    p_name: 'Private Throwing Circle',
    p_description: 'Members only',
    p_interests: ['pottery'],
    p_visibility: 'private',
  });
  if (error || !data) throw new Error(`create_group_with_owner failed: ${error?.message}`);
  groupId = data as string;

  const joined = await admin.from('group_members').insert([
    {
      group_id: groupId,
      user_id: removed.id,
      role: 'member',
      status: 'active',
      joined_at: new Date().toISOString(),
    },
    {
      group_id: groupId,
      user_id: leaver.id,
      role: 'member',
      status: 'active',
      joined_at: new Date().toISOString(),
    },
  ]);
  if (joined.error) throw new Error(joined.error.message);
}, 60_000);

afterAll(async () => {
  await admin.from('groups').delete().eq('id', groupId);
  await cleanupSocialUsers(admin);
});

describe('leaving or being removed from a group', () => {
  it('stops the removed member seeing the group at once, not when the cache expires', async () => {
    expect(await graphNodeIds(removed)).toContain(`group:${groupId}`);

    actAs(owner);
    const res = await call(removeMember, {
      method: 'DELETE',
      path: `/api/groups/${groupId}/members/${removed.id}`,
      params: { id: groupId, userId: removed.id },
    });
    expect(res.status).toBe(200);

    expect(await graphNodeIds(removed)).not.toContain(`group:${groupId}`);
  });

  it('does the same for someone who leaves of their own accord', async () => {
    expect(await graphNodeIds(leaver)).toContain(`group:${groupId}`);

    actAs(leaver);
    const res = await call(leaveGroup, {
      method: 'POST',
      path: `/api/groups/${groupId}/leave`,
      params: { id: groupId },
    });
    expect(res.status).toBe(200);

    expect(await graphNodeIds(leaver)).not.toContain(`group:${groupId}`);
  });

  it('leaves the group on the owner’s graph', async () => {
    expect(await graphNodeIds(owner)).toContain(`group:${groupId}`);
  });
});
