import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, createTestUser, type TestUser } from '../helpers';
import { cleanupSocialUsers } from './support';

const admin = adminClient();
let alice: TestUser;
let bob: TestUser;
let carol: TestUser;
let dave: TestUser;

beforeAll(async () => {
  [alice, bob, carol, dave] = await Promise.all([
    createTestUser(admin, 'rls-alice'),
    createTestUser(admin, 'rls-bob'),
    createTestUser(admin, 'rls-carol'),
    createTestUser(admin, 'rls-dave'),
  ]);
  // Connection requests need a reachable (discoverable) recipient since 0303.
  await admin.from('profiles').update({ is_discoverable: true }).in('id', [alice.id, bob.id, carol.id, dave.id]);
});

afterAll(async () => {
  await cleanupSocialUsers(admin);
});

async function createGroup(owner: TestUser, visibility: 'public' | 'private', name = 'Test group') {
  const { data, error } = await admin.rpc('create_group_with_owner', {
    p_creator: owner.id,
    p_name: name,
    p_description: 'desc',
    p_interests: ['pottery'],
    p_visibility: visibility,
  });
  if (error || !data) throw new Error(`create_group_with_owner failed: ${error?.message}`);
  return data;
}

async function membership(groupId: string, userId: string) {
  const { data } = await admin.from('group_members').select('role, status, joined_at').eq('group_id', groupId).eq('user_id', userId).maybeSingle();
  return data;
}

describe('connections', () => {
  it('lets the requester create a pending request and enforces one edge per pair', async () => {
    const { data, error } = await alice.client.from('connections').insert({ requester_id: alice.id, recipient_id: bob.id, message: 'hi' }).select('*').single();
    expect(error).toBeNull();
    expect(data?.status).toBe('pending');
    const reverse = await bob.client.from('connections').insert({ requester_id: bob.id, recipient_id: alice.id });
    expect(reverse.error?.code).toBe('23505');
  });

  it('rejects direct inserts to people the requester cannot reach', async () => {
    await admin.from('profiles').update({ is_discoverable: false }).eq('id', dave.id);
    const unreachable = await carol.client.from('connections').insert({ requester_id: carol.id, recipient_id: dave.id });
    expect(unreachable.error).not.toBeNull();
    await admin.from('profiles').update({ is_discoverable: true }).eq('id', dave.id);
  });

  it('rejects inserts on behalf of someone else or pre-accepted', async () => {
    const spoof = await carol.client.from('connections').insert({ requester_id: dave.id, recipient_id: carol.id });
    expect(spoof.error).not.toBeNull();
    const accepted = await carol.client.from('connections').insert({ requester_id: carol.id, recipient_id: dave.id, status: 'accepted' });
    expect(accepted.error).not.toBeNull();
  });

  it('only the recipient can accept, and responded_at is set', async () => {
    const byRequester = await alice.client.from('connections').update({ status: 'accepted' }).eq('requester_id', alice.id).eq('recipient_id', bob.id).select();
    expect(byRequester.data).toEqual([]);
    const byRecipient = await bob.client.from('connections').update({ status: 'accepted' }).eq('requester_id', alice.id).eq('recipient_id', bob.id).select('status, responded_at').single();
    expect(byRecipient.error).toBeNull();
    expect(byRecipient.data?.status).toBe('accepted');
    expect(byRecipient.data?.responded_at).not.toBeNull();
  });

  it('third parties cannot read the edge', async () => {
    const { data } = await carol.client.from('connections').select('id').or(`requester_id.eq.${alice.id},recipient_id.eq.${alice.id}`);
    expect(data).toEqual([]);
  });

  it('rejects invalid transitions and edits to the parties', async () => {
    const reopen = await bob.client.from('connections').update({ status: 'pending' }).eq('requester_id', alice.id).eq('recipient_id', bob.id);
    expect(reopen.error?.message).toContain('CONNECTION_TRANSITION');
    const hijack = await bob.client.from('connections').update({ requester_id: carol.id }).eq('requester_id', alice.id).eq('recipient_id', bob.id);
    expect(hijack.error).not.toBeNull();
  });
});

describe('blocks and reports', () => {
  it('keeps blocks private to the blocker and stops requests across a block', async () => {
    const insert = await carol.client.from('blocks').insert({ blocker_id: carol.id, blocked_id: dave.id });
    expect(insert.error).toBeNull();
    const seenByDave = await dave.client.from('blocks').select('*');
    expect(seenByDave.data).toEqual([]);
    const request = await dave.client.from('connections').insert({ requester_id: dave.id, recipient_id: carol.id });
    expect(request.error).not.toBeNull();
    const reverse = await carol.client.from('connections').insert({ requester_id: carol.id, recipient_id: dave.id });
    expect(reverse.error).not.toBeNull();
  });

  it('accepts a report from the reporter only and never shows it back', async () => {
    const ok = await alice.client.from('reports').insert({ reporter_id: alice.id, reported_id: dave.id, reason: 'spam' });
    expect(ok.error).toBeNull();
    const spoof = await alice.client.from('reports').insert({ reporter_id: bob.id, reported_id: dave.id, reason: 'spam' });
    expect(spoof.error).not.toBeNull();
    const read = await alice.client.from('reports').select('*');
    expect(read.data).toEqual([]);
  });

  it('service-role functions are not callable by users', async () => {
    const { error } = await alice.client.rpc('block_user', { p_blocker: alice.id, p_blocked: dave.id });
    expect(error).not.toBeNull();
  });

  it('block_user declines pending requests in both directions', async () => {
    const pending = await dave.client.from('connections').insert({ requester_id: dave.id, recipient_id: alice.id }).select('id').single();
    expect(pending.error).toBeNull();
    const { error } = await admin.rpc('block_user', { p_blocker: alice.id, p_blocked: dave.id });
    expect(error).toBeNull();
    const after = await admin.from('connections').select('status').eq('id', pending.data!.id).single();
    expect(after.data?.status).toBe('declined');
  });
});

describe('groups and invitations', () => {
  it('hides private groups and their rosters from non-members', async () => {
    const groupId = await createGroup(alice, 'private', 'Secret supper club');
    const group = await carol.client.from('groups').select('id').eq('id', groupId);
    expect(group.data).toEqual([]);
    const roster = await carol.client.from('group_members').select('user_id').eq('group_id', groupId);
    expect(roster.data).toEqual([]);
    const own = await alice.client.from('groups').select('id, kind').eq('id', groupId).single();
    expect(own.data?.kind).toBe('private');
  });

  it('shows public groups and rosters to every signed-in user', async () => {
    const groupId = await createGroup(alice, 'public', 'Open potters');
    const group = await carol.client.from('groups').select('id, kind').eq('id', groupId).single();
    expect(group.data?.kind).toBe('interest');
    const roster = await carol.client.from('group_members').select('user_id').eq('group_id', groupId);
    expect(roster.data?.map((r) => r.user_id)).toEqual([alice.id]);
  });

  it('invites, lets only the recipient accept, and activates the membership', async () => {
    const groupId = await createGroup(alice, 'private', 'Thursday makers');
    const { data: invited, error } = await admin.rpc('invite_to_group', { p_group: groupId, p_sender: alice.id, p_recipients: [bob.id, bob.id, alice.id] });
    expect(error).toBeNull();
    expect(invited?.map((row) => row.invitee_id)).toEqual([bob.id]);
    expect((await membership(groupId, bob.id))?.status).toBe('invited');
    const visible = await bob.client.from('groups').select('id').eq('id', groupId);
    expect(visible.data).toHaveLength(1);

    const invitationId = invited![0]!.invitation_id;
    const stolen = await carol.client.from('invitations').update({ status: 'accepted' }).eq('id', invitationId).select();
    expect(stolen.data).toEqual([]);
    const accepted = await bob.client.from('invitations').update({ status: 'accepted' }).eq('id', invitationId).select('status, responded_at').single();
    expect(accepted.error).toBeNull();
    expect(accepted.data?.responded_at).not.toBeNull();
    const member = await membership(groupId, bob.id);
    expect(member?.status).toBe('active');
    expect(member?.joined_at).not.toBeNull();

    const again = await bob.client.from('invitations').update({ status: 'declined' }).eq('id', invitationId);
    expect(again.error?.message).toContain('INVITATION_NOT_PENDING');
    const repeat = await admin.rpc('invite_to_group', { p_group: groupId, p_sender: alice.id, p_recipients: [bob.id] });
    expect(repeat.data).toEqual([]);
  });

  it('declining leaves the membership as left, and a later invite reopens it', async () => {
    const groupId = await createGroup(alice, 'private', 'Decliners');
    const first = await admin.rpc('invite_to_group', { p_group: groupId, p_sender: alice.id, p_recipients: [carol.id] });
    await carol.client.from('invitations').update({ status: 'declined' }).eq('id', first.data![0]!.invitation_id);
    expect((await membership(groupId, carol.id))?.status).toBe('left');
    const second = await admin.rpc('invite_to_group', { p_group: groupId, p_sender: alice.id, p_recipients: [carol.id] });
    expect(second.data).toHaveLength(1);
    expect((await membership(groupId, carol.id))?.status).toBe('invited');
  });

  it('never removes the owner, and removing an invitee expires the invitation', async () => {
    const groupId = await createGroup(alice, 'private', 'Removals');
    const ownerRemoval = await admin.rpc('remove_group_member', { p_group: groupId, p_user: alice.id });
    expect(ownerRemoval.error?.message).toContain('MEMBER_NOT_REMOVABLE');
    const invited = await admin.rpc('invite_to_group', { p_group: groupId, p_sender: alice.id, p_recipients: [carol.id] });
    const removed = await admin.rpc('remove_group_member', { p_group: groupId, p_user: carol.id });
    expect(removed.error).toBeNull();
    expect((await membership(groupId, carol.id))?.status).toBe('removed');
    const invitation = await admin.from('invitations').select('status').eq('id', invited.data![0]!.invitation_id).single();
    expect(invitation.data?.status).toBe('expired');
  });

  it('requires the owner to transfer before leaving, then archives when the last member leaves', async () => {
    const groupId = await createGroup(alice, 'private', 'Leavers');
    const invited = await admin.rpc('invite_to_group', { p_group: groupId, p_sender: alice.id, p_recipients: [bob.id] });
    await bob.client.from('invitations').update({ status: 'accepted' }).eq('id', invited.data![0]!.invitation_id);

    const blocked = await admin.rpc('leave_group', { p_group: groupId, p_user: alice.id });
    expect(blocked.error?.message).toContain('OWNER_MUST_TRANSFER');
    const transfer = await admin.rpc('transfer_group_owner', { p_group: groupId, p_from: alice.id, p_to: bob.id });
    expect(transfer.error).toBeNull();
    expect((await membership(groupId, bob.id))?.role).toBe('owner');
    expect((await membership(groupId, alice.id))?.role).toBe('admin');

    const left = await admin.rpc('leave_group', { p_group: groupId, p_user: alice.id });
    expect(left.data).toBe('left');
    const last = await admin.rpc('leave_group', { p_group: groupId, p_user: bob.id });
    expect(last.data).toBe('archived');
    const archived = await admin.from('groups').select('archived_at').eq('id', groupId).single();
    expect(archived.data?.archived_at).not.toBeNull();
    const hidden = await bob.client.from('groups').select('id').eq('id', groupId);
    expect(hidden.data).toEqual([]);
  });

  it('lets admins edit descriptive fields only, and members not at all', async () => {
    const groupId = await createGroup(alice, 'public', 'Editable');
    const invited = await admin.rpc('invite_to_group', { p_group: groupId, p_sender: alice.id, p_recipients: [carol.id] });
    await carol.client.from('invitations').update({ status: 'accepted' }).eq('id', invited.data![0]!.invitation_id);

    const byAdmin = await alice.client.from('groups').update({ name: 'Edited' }).eq('id', groupId).select('name').single();
    expect(byAdmin.data?.name).toBe('Edited');
    const byMember = await carol.client.from('groups').update({ name: 'Hijacked' }).eq('id', groupId).select();
    expect(byMember.data).toEqual([]);
    const creator = await alice.client.from('groups').update({ creator_id: carol.id }).eq('id', groupId);
    expect(creator.error?.message).toContain('GROUP_IMMUTABLE');
  });

  it('shows plans only to active members of that group', async () => {
    const groupId = await createGroup(alice, 'private', 'Planners');
    const otherGroup = await createGroup(carol, 'private', 'Other planners');
    const { error } = await admin.from('group_plans').insert({ group_id: groupId, requested_by: alice.id, request_text: 'dinner?', suggestions: [], members_included: 2 });
    expect(error).toBeNull();
    expect((await alice.client.from('group_plans').select('id').eq('group_id', groupId)).data).toHaveLength(1);
    expect((await carol.client.from('group_plans').select('id').eq('group_id', groupId)).data).toEqual([]);
    expect(otherGroup).toBeTruthy();
  });
});

describe('RLS guard', () => {
  it('every workstream 03 table has row level security', async () => {
    const { data, error } = await admin.rpc('tables_without_rls');
    expect(error).toBeNull();
    const social = ['connections', 'blocks', 'reports', 'groups', 'group_members', 'invitations', 'group_plans', 'group_plan_votes'];
    expect((data ?? []).filter((table: string) => social.includes(table))).toEqual([]);
  });
});
