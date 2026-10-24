import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { adminClient, cleanupTestUsers, createTestUser, type TestUser } from '../helpers';
import { actAs, call, setProfile } from './support';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', async () => {
  const support = await import('./support');
  return { createServerClient: async () => support.session.client };
});

const { GET: listGroups, POST: createGroup } = await import('@/app/api/groups/route');
const { GET: getGroup, PATCH: patchGroup } = await import('@/app/api/groups/[id]/route');
const { POST: invite } = await import('@/app/api/groups/[id]/invite/route');
const { DELETE: removeMember } = await import('@/app/api/groups/[id]/members/[userId]/route');
const { POST: leave } = await import('@/app/api/groups/[id]/leave/route');
const { PATCH: answerInvitation } = await import('@/app/api/invitations/[id]/route');

const admin = adminClient();
let owner: TestUser, adminUser: TestUser, member: TestUser, invitee: TestUser, outsider: TestUser, blocked: TestUser, hidden: TestUser;
let groupId: string;

beforeAll(async () => {
  [owner, adminUser, member, invitee, outsider, blocked, hidden] = await Promise.all([
    createTestUser(admin, 'grp-owner'),
    createTestUser(admin, 'grp-admin'),
    createTestUser(admin, 'grp-member'),
    createTestUser(admin, 'grp-invitee'),
    createTestUser(admin, 'grp-outsider'),
    createTestUser(admin, 'grp-blocked'),
    createTestUser(admin, 'grp-hidden'),
  ]);
  await Promise.all([owner, adminUser, member, invitee, outsider, blocked].map((u) => setProfile(admin, u)));
  await setProfile(admin, hidden, {}, { matching: false }, { discoverable: false });
  await admin.from('blocks').insert({ blocker_id: blocked.id, blocked_id: owner.id });
}, 60_000);

afterAll(async () => {
  await cleanupTestUsers(admin);
});

const memberStatus = async (userId: string) =>
  (await admin.from('group_members').select('role, status').eq('group_id', groupId).eq('user_id', userId).maybeSingle()).data;

describe('create and view', () => {
  it('creates a private group with the creator as active owner', async () => {
    actAs(owner);
    const res = await call(createGroup, { method: 'POST', body: { name: 'Thursday Makers', description: 'Clay and coffee', interests: ['Pottery', 'coffee shops'], visibility: 'private' } });
    expect(res.status).toBe(201);
    groupId = res.body.data.id;
    expect(res.body.data).toMatchObject({ name: 'Thursday Makers', visibility: 'private', kind: 'private', myRole: 'owner', myStatus: 'active', memberCount: 1, interests: ['pottery', 'coffee-shops'] });
    expect(res.body.data.permissions).toMatchObject({ canEdit: true, canInvite: true, canPlan: true, canTransfer: true });
    expect(res.body.data.members.map((m: { user: { id: string } }) => m.user.id)).toEqual([owner.id]);
  });

  it('keeps a private group invisible to non-members', async () => {
    actAs(outsider);
    expect((await call(getGroup, { params: { id: groupId } })).status).toBe(404);
    expect((await call(listGroups, { path: '/api/groups' })).body.data).toEqual([]);
    expect((await call(getGroup, { params: { id: 'not-a-uuid' } })).status).toBe(404);
  });

  it('rejects invalid bodies', async () => {
    actAs(owner);
    expect((await call(createGroup, { method: 'POST', body: { name: 'x' } })).status).toBe(400);
    expect((await call(createGroup, { method: 'POST', body: { name: 'Fine name', visibility: 'secret' } })).status).toBe(400);
  });
});

describe('invitations', () => {
  it('invites reachable people, skips blocked, unreachable and existing members, and notifies', async () => {
    actAs(owner);
    const res = await call(invite, { method: 'POST', params: { id: groupId }, body: { userIds: [member.id, invitee.id, adminUser.id, blocked.id, hidden.id, owner.id] } });
    expect(res.status).toBe(200);
    expect(res.body.data.invited.sort()).toEqual([member.id, invitee.id, adminUser.id].sort());
    expect(res.body.data.skipped).toEqual({ alreadyMember: 0, blocked: 1, unreachable: 1 });
    const { data: notes } = await admin.from('notifications').select('type, payload').eq('user_id', member.id);
    expect(notes).toEqual([expect.objectContaining({ type: 'group_invite', payload: expect.objectContaining({ groupId, title: 'Test grp-owner invited you to Thursday Makers' }) })]);
    const again = await call(invite, { method: 'POST', params: { id: groupId }, body: { userIds: [member.id] } });
    expect(again.body.data).toEqual({ invited: [], skipped: { alreadyMember: 1, blocked: 0, unreachable: 0 } });
  });

  it('shows the invitation in the invitee list and lets only the invitee answer', async () => {
    actAs(member);
    const mine = await call(listGroups, { path: '/api/groups' });
    expect(mine.body.data).toEqual([expect.objectContaining({ id: groupId, myStatus: 'invited', invitationId: expect.any(String) })]);
    const invitationId = mine.body.data[0].invitationId;

    actAs(owner);
    expect((await call(answerInvitation, { method: 'PATCH', params: { id: invitationId }, body: { status: 'accepted' } })).status).toBe(403);
    actAs(outsider);
    expect((await call(answerInvitation, { method: 'PATCH', params: { id: invitationId }, body: { status: 'accepted' } })).status).toBe(404);

    actAs(member);
    const accepted = await call(answerInvitation, { method: 'PATCH', params: { id: invitationId }, body: { status: 'accepted' } });
    expect(accepted.body.data).toMatchObject({ kind: 'group', status: 'accepted', groupId });
    expect(await memberStatus(member.id)).toEqual({ role: 'member', status: 'active' });
    const twice = await call(answerInvitation, { method: 'PATCH', params: { id: invitationId }, body: { status: 'declined' } });
    expect(twice.status).toBe(409);
  });

  it('declining closes the membership and drops the group from the list', async () => {
    actAs(invitee);
    const { invitationId } = (await call(listGroups, { path: '/api/groups' })).body.data[0];
    await call(answerInvitation, { method: 'PATCH', params: { id: invitationId }, body: { status: 'declined' } });
    expect(await memberStatus(invitee.id)).toMatchObject({ status: 'left' });
    expect((await call(listGroups, { path: '/api/groups' })).body.data).toEqual([]);
  });

  it('only admins invite to a private group', async () => {
    actAs(member);
    expect((await call(invite, { method: 'POST', params: { id: groupId }, body: { userIds: [outsider.id] } })).status).toBe(403);
  });

  it('shows pending invitees to admins only', async () => {
    actAs(owner);
    const forOwner = await call(getGroup, { params: { id: groupId } });
    expect(forOwner.body.data.invited.map((m: { user: { id: string } }) => m.user.id)).toEqual([adminUser.id]);
    actAs(member);
    const forMember = await call(getGroup, { params: { id: groupId } });
    expect(forMember.body.data.invited).toEqual([]);
    expect(forMember.body.data.memberCount).toBe(2);
  });
});

describe('editing, removal and leaving', () => {
  beforeAll(async () => {
    const { data } = await admin.from('invitations').select('id').eq('group_id', groupId).eq('recipient_id', adminUser.id).single();
    await adminUser.client.from('invitations').update({ status: 'accepted' }).eq('id', data!.id);
    await admin.from('group_members').update({ role: 'admin' }).eq('group_id', groupId).eq('user_id', adminUser.id);
  });

  it('lets admins edit and stops members', async () => {
    actAs(member);
    expect((await call(patchGroup, { method: 'PATCH', params: { id: groupId }, body: { name: 'Hijacked' } })).status).toBe(403);
    actAs(adminUser);
    const res = await call(patchGroup, { method: 'PATCH', params: { id: groupId }, body: { description: 'Wheels on Thursdays', interests: ['Pottery', 'Glazing'] } });
    expect(res.body.data).toMatchObject({ description: 'Wheels on Thursdays', interests: ['pottery', 'glazing'] });
    expect((await call(patchGroup, { method: 'PATCH', params: { id: groupId }, body: {} })).status).toBe(400);
  });

  it('never removes the owner, and only the owner removes an admin', async () => {
    actAs(adminUser);
    const ownerRemoval = await call(removeMember, { method: 'DELETE', params: { id: groupId, userId: owner.id } });
    expect(ownerRemoval.status).toBe(403);
    expect(ownerRemoval.body.error?.message).toBe('The owner cannot be removed');
    actAs(member);
    expect((await call(removeMember, { method: 'DELETE', params: { id: groupId, userId: adminUser.id } })).status).toBe(403);
    actAs(owner);
    expect((await call(removeMember, { method: 'DELETE', params: { id: groupId, userId: owner.id } })).status).toBe(400);
  });

  it('removes a member, who then loses access to the private group', async () => {
    actAs(adminUser);
    expect((await call(removeMember, { method: 'DELETE', params: { id: groupId, userId: member.id } })).status).toBe(200);
    expect(await memberStatus(member.id)).toMatchObject({ status: 'removed' });
    actAs(member);
    expect((await call(getGroup, { params: { id: groupId } })).status).toBe(404);
  });

  it('requires the owner to transfer before leaving, then archives when the last member leaves', async () => {
    actAs(owner);
    const blockedLeave = await call(leave, { method: 'POST', params: { id: groupId } });
    expect(blockedLeave.status).toBe(409);
    actAs(adminUser);
    expect((await call(patchGroup, { method: 'PATCH', params: { id: groupId }, body: { transferOwnerTo: adminUser.id } })).status).toBe(403);
    actAs(owner);
    expect((await call(patchGroup, { method: 'PATCH', params: { id: groupId }, body: { transferOwnerTo: outsider.id } })).status).toBe(400);
    const transferred = await call(patchGroup, { method: 'PATCH', params: { id: groupId }, body: { transferOwnerTo: adminUser.id } });
    expect(transferred.status).toBe(200);
    expect(transferred.body.data.myRole).toBe('admin');
    expect((await call(leave, { method: 'POST', params: { id: groupId } })).body.data).toEqual({ status: 'left' });
    actAs(adminUser);
    expect((await call(leave, { method: 'POST', params: { id: groupId } })).body.data).toEqual({ status: 'archived' });
    expect((await call(getGroup, { params: { id: groupId } })).status).toBe(404);
  });
});

describe('public groups', () => {
  it('are visible to everyone, joinable by member invites, and listed for discovery', async () => {
    actAs(owner);
    const created = await call(createGroup, { method: 'POST', body: { name: 'Open Studio Crew', interests: ['pottery'], visibility: 'public' } });
    const publicId = created.body.data.id;
    actAs(outsider);
    const view = await call(getGroup, { params: { id: publicId } });
    expect(view.status).toBe(200);
    expect(view.body.data).toMatchObject({ kind: 'interest', myRole: null, permissions: { canInvite: false, canPlan: false } });
    const discover = await call(listGroups, { path: '/api/groups?discover=1' });
    expect(discover.body.data.map((g: { id: string }) => g.id)).toContain(publicId);

    actAs(owner);
    const invited = await call(invite, { method: 'POST', params: { id: publicId }, body: { userIds: [member.id] } });
    expect(invited.body.data.invited).toEqual([member.id]);
    const { data } = await admin.from('invitations').select('id').eq('group_id', publicId).eq('recipient_id', member.id).single();
    actAs(member);
    await call(answerInvitation, { method: 'PATCH', params: { id: data!.id }, body: { status: 'accepted' } });
    const byMember = await call(invite, { method: 'POST', params: { id: publicId }, body: { userIds: [outsider.id] } });
    expect(byMember.body.data.invited).toEqual([outsider.id]);
  });

  it('hides groups created by someone the viewer blocked or who blocked the viewer', async () => {
    actAs(blocked);
    const discover = await call(listGroups, { path: '/api/groups?discover=1' });
    expect(discover.body.data.map((g: { name: string }) => g.name)).not.toContain('Open Studio Crew');
  });
});
