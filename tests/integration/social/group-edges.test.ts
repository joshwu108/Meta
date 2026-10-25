import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { adminClient, createTestUser, type TestUser } from '../helpers';
import { actAs, call, cleanupSocialUsers, setProfile, setTestOrigin } from './support';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', async () => {
  const support = await import('./support');
  return { createServerClient: async () => support.session.client };
});

const { POST: createGroup } = await import('@/app/api/groups/route');
const { GET: getGroup, PATCH: patchGroup } = await import('@/app/api/groups/[id]/route');
const { POST: join } = await import('@/app/api/groups/[id]/join/route');
const { POST: invite } = await import('@/app/api/groups/[id]/invite/route');
const { DELETE: removeMember } = await import('@/app/api/groups/[id]/members/[userId]/route');
const { POST: leave } = await import('@/app/api/groups/[id]/leave/route');
const { POST: plan } = await import('@/app/api/groups/[id]/plan/route');
const { POST: vote } = await import('@/app/api/groups/[id]/plans/[planId]/vote/route');
const { PATCH: answer } = await import('@/app/api/invitations/[id]/route');
const { aiRateLimiter } = await import('@/lib/api');

setTestOrigin('group-edges');
const admin = adminClient();
let owner: TestUser, friend: TestUser, outsider: TestUser;

beforeAll(async () => {
  [owner, friend, outsider] = await Promise.all([createTestUser(admin, 'edge-owner'), createTestUser(admin, 'edge-friend'), createTestUser(admin, 'edge-outsider')]);
  await Promise.all([owner, friend, outsider].map((u) => setProfile(admin, u)));
}, 60_000);

afterAll(async () => {
  await cleanupSocialUsers(admin);
});

async function newGroup(visibility: 'public' | 'private', name: string): Promise<string> {
  actAs(owner);
  return (await call(createGroup, { method: 'POST', body: { name, visibility } })).body.data.id;
}

async function invitationFor(groupId: string, user: TestUser): Promise<string> {
  const { data } = await admin.from('invitations').select('id').eq('group_id', groupId).eq('recipient_id', user.id).eq('status', 'pending').single();
  return data!.id;
}

describe('group edge cases', () => {
  it('rejects accepting an invitation after the group was archived', async () => {
    const groupId = await newGroup('private', 'Soon archived');
    await call(invite, { method: 'POST', params: { id: groupId }, body: { userIds: [friend.id] } });
    const invitationId = await invitationFor(groupId, friend);
    expect((await call(leave, { method: 'POST', params: { id: groupId } })).body.data).toEqual({ status: 'archived' });
    actAs(friend);
    const res = await call(answer, { method: 'PATCH', params: { id: invitationId }, body: { status: 'accepted' } });
    expect(res.status).toBe(409);
    actAs(owner);
    expect((await call(invite, { method: 'POST', params: { id: groupId }, body: { userIds: [friend.id] } })).status).toBe(404);
  });

  it('rejects transferring ownership to yourself and leaving while only invited', async () => {
    const groupId = await newGroup('private', 'Self transfer');
    expect((await call(patchGroup, { method: 'PATCH', params: { id: groupId }, body: { transferOwnerTo: owner.id } })).status).toBe(400);
    await call(invite, { method: 'POST', params: { id: groupId }, body: { userIds: [friend.id] } });
    actAs(friend);
    expect((await call(leave, { method: 'POST', params: { id: groupId } })).status).toBe(403);
    expect((await call(patchGroup, { method: 'PATCH', params: { id: groupId }, body: { transferOwnerTo: owner.id, name: 'x' } })).status).toBe(400);
  });

  it('reopens a removed membership on re-invite and cannot remove someone twice', async () => {
    const groupId = await newGroup('private', 'Second chances');
    await call(invite, { method: 'POST', params: { id: groupId }, body: { userIds: [friend.id] } });
    actAs(friend);
    await call(answer, { method: 'PATCH', params: { id: await invitationFor(groupId, friend) }, body: { status: 'accepted' } });
    actAs(owner);
    expect((await call(removeMember, { method: 'DELETE', params: { id: groupId, userId: friend.id } })).status).toBe(200);
    expect((await call(removeMember, { method: 'DELETE', params: { id: groupId, userId: friend.id } })).status).toBe(404);
    const again = await call(invite, { method: 'POST', params: { id: groupId }, body: { userIds: [friend.id] } });
    expect(again.body.data.invited).toEqual([friend.id]);
    const { data } = await admin.from('group_members').select('status, role').eq('group_id', groupId).eq('user_id', friend.id).single();
    expect(data).toEqual({ status: 'invited', role: 'member' });
  });

  it('keeps outsiders of a public group from editing, voting or planning', async () => {
    const groupId = await newGroup('public', 'Open but guarded');
    const { data: planRow } = await admin.from('group_plans').insert({ group_id: groupId, requested_by: owner.id, request_text: 'x', suggestions: [], members_included: 0 }).select('id').single();
    actAs(outsider);
    expect((await call(patchGroup, { method: 'PATCH', params: { id: groupId }, body: { name: 'Mine now' } })).status).toBe(403);
    expect((await call(vote, { method: 'POST', params: { id: groupId, planId: planRow!.id }, body: { suggestionIndex: 0 } })).status).toBe(403);
    expect((await call(plan, { method: 'POST', params: { id: groupId }, body: { request: 'anything' } })).status).toBe(403);
    expect((await call(invite, { method: 'POST', params: { id: groupId }, body: { userIds: [friend.id] } })).status).toBe(403);
  });

  it('rate-limits the planner per user', async () => {
    const groupId = await newGroup('private', 'Busy planners');
    aiRateLimiter.reset();
    for (let i = 0; i < 20; i += 1) aiRateLimiter.hit(owner.id);
    actAs(owner);
    const res = await call(plan, { method: 'POST', params: { id: groupId }, body: { request: 'one more' } });
    expect(res.status).toBe(429);
    expect(res.body.error?.code).toBe('RATE_LIMITED');
    aiRateLimiter.reset();
  });
});

describe('joining public groups (POST /api/groups/:id/join)', () => {
  it('lets anyone join a public interest group and rejoin after leaving, as a plain member', async () => {
    const groupId = await newGroup('public', 'Open table');
    const privateId = await newGroup('private', 'Closed table');
    actAs(outsider);
    expect((await call(getGroup, { params: { id: groupId } })).body.data.permissions.canJoin).toBe(true);
    const joined = await call(join, { method: 'POST', params: { id: groupId } });
    expect(joined.status).toBe(200);
    expect(joined.body.data).toEqual({ status: 'active' });
    expect((await call(getGroup, { params: { id: groupId } })).body.data).toMatchObject({ myStatus: 'active', permissions: { canJoin: false } });
    expect((await call(join, { method: 'POST', params: { id: groupId } })).status).toBe(409);
    expect((await call(join, { method: 'POST', params: { id: privateId } })).status).toBe(404);

    actAs(owner);
    await call(patchGroup, { method: 'PATCH', params: { id: groupId }, body: { transferOwnerTo: outsider.id } });
    actAs(outsider);
    await call(patchGroup, { method: 'PATCH', params: { id: groupId }, body: { transferOwnerTo: owner.id } });
    const before = await admin.from('group_members').select('role').eq('group_id', groupId).eq('user_id', outsider.id).single();
    expect(before.data?.role).toBe('admin');
    expect((await call(leave, { method: 'POST', params: { id: groupId } })).body.data).toEqual({ status: 'left' });
    expect((await call(join, { method: 'POST', params: { id: groupId } })).status).toBe(200);
    const { data: row } = await admin.from('group_members').select('role, status').eq('group_id', groupId).eq('user_id', outsider.id).single();
    expect(row).toEqual({ role: 'member', status: 'active' });
  });

  it('keeps someone an admin removed out until they are invited back', async () => {
    const groupId = await newGroup('public', 'Removal sticks');
    actAs(friend);
    expect((await call(join, { method: 'POST', params: { id: groupId } })).status).toBe(200);
    actAs(owner);
    expect((await call(removeMember, { method: 'DELETE', params: { id: groupId, userId: friend.id } })).status).toBe(200);
    actAs(friend);
    const res = await call(join, { method: 'POST', params: { id: groupId } });
    expect(res.status).toBe(403);
    expect((await call(getGroup, { params: { id: groupId } })).body.data.permissions.canJoin).toBe(false);
  });
});
