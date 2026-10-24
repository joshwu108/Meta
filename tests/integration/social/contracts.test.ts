import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { adminClient, createTestUser, type TestUser } from '../helpers';
import { cleanupSocialUsers, setProfile, testOrigin, setTestOrigin } from './support';

vi.mock('server-only', () => ({}));

const groups = await import('@/features/groups');
const matching = await import('@/features/matching');
const sixStubs = await import('@/features/groups/server/stubs');

setTestOrigin('contracts');
const admin = adminClient();
let alice: TestUser, bob: TestUser, carol: TestUser, dave: TestUser;
let publicId: string, privateId: string, archivedId: string;
const EVENT_ID = '3b1d6c1a-9f2e-4c3b-8a7d-5e6f7a8b9c0d';

async function group(owner: TestUser, name: string, visibility: 'public' | 'private', members: TestUser[] = []): Promise<string> {
  const { data } = await admin.rpc('create_group_with_owner', { p_creator: owner.id, p_name: name, p_visibility: visibility });
  for (const member of members) {
    await admin.from('group_members').insert({ group_id: data!, user_id: member.id, role: 'member', status: 'active', joined_at: new Date().toISOString() });
  }
  return data!;
}

beforeAll(async () => {
  [alice, bob, carol, dave] = await Promise.all([
    createTestUser(admin, 'contract-alice'),
    createTestUser(admin, 'contract-bob'),
    createTestUser(admin, 'contract-carol'),
    createTestUser(admin, 'contract-dave'),
  ]);
  await Promise.all([alice, bob, carol, dave].map((u) => setProfile(admin, u)));
  publicId = await group(alice, 'Contract public big', 'public', [bob, carol]);
  privateId = await group(alice, 'Contract private', 'private', [bob]);
  archivedId = await group(dave, 'Contract archived', 'public');
  await admin.rpc('leave_group', { p_group: archivedId, p_user: dave.id });
  await admin.from('group_members').insert({ group_id: privateId, user_id: carol.id, role: 'member', status: 'invited' });
  await admin.from('connections').insert({ requester_id: alice.id, recipient_id: bob.id, status: 'accepted' });
  await admin.from('blocks').insert({ blocker_id: dave.id, blocked_id: alice.id });
}, 60_000);

afterAll(async () => {
  await cleanupSocialUsers(admin);
});

describe('getGroupMemberIds (README §4)', () => {
  it('returns active members only', async () => {
    expect((await groups.getGroupMemberIds(privateId)).sort()).toEqual([alice.id, bob.id].sort());
    expect(await groups.getGroupMemberIds(publicId)).toHaveLength(3);
  });

  it('returns nothing for archived or unknown groups and rejects malformed ids', async () => {
    expect(await groups.getGroupMemberIds(archivedId)).toEqual([]);
    expect(await groups.getGroupMemberIds(crypto.randomUUID())).toEqual([]);
    await expect(groups.getGroupMemberIds('nope')).rejects.toThrow();
  });
});

describe('getPublicGroups', () => {
  it('lists public, non-archived groups largest first, without member identities', async () => {
    const list = await groups.getPublicGroups(50);
    const mine = list.filter((g) => g.name.startsWith('Contract'));
    expect(mine).toEqual([expect.objectContaining({ id: publicId, memberCount: 3 })]);
    expect(Object.keys(mine[0]!).sort()).toEqual(['description', 'id', 'interests', 'memberCount', 'name']);
    expect(await groups.getPublicGroups(0)).toEqual([]);
  });
});

describe('event invitations for 06', () => {
  it('creates, finds and lists pending event invitations without touching memberships', async () => {
    const ids = await groups.createEventInvitations({ senderId: alice.id, groupId: publicId, eventId: EVENT_ID, recipientIds: [bob.id, carol.id] });
    expect(ids).toHaveLength(2);
    expect(await groups.createEventInvitations({ senderId: alice.id, groupId: publicId, eventId: EVENT_ID, recipientIds: [] })).toEqual([]);
    expect(await groups.getPendingEventInviteeIds(EVENT_ID, [bob.id, carol.id, dave.id])).toEqual(new Set([bob.id, carol.id]));
    expect(await groups.getPendingEventInviteeIds(EVENT_ID, [])).toEqual(new Set());
    const forBob = await groups.getPendingEventInvitations(bob.id);
    expect(forBob).toEqual([expect.objectContaining({ eventId: EVENT_ID, groupId: publicId, senderId: alice.id })]);
    expect(await groups.getGroupMemberIds(publicId)).toHaveLength(3);
  });
});

describe('matching exports', () => {
  it('getConnectionIds and getBlockEdges see both directions', async () => {
    expect(await matching.getConnectionIds(bob.id)).toEqual(new Set([alice.id]));
    expect(await matching.getBlockEdges(alice.id)).toEqual([{ blockerId: dave.id, blockedId: alice.id }]);
    expect(await matching.getBlockedIds(alice.id)).toEqual(new Set([dave.id]));
  });

  it('getSuggestedPeople returns compact cards from the match list', async () => {
    matching.invalidateMatches(carol.id);
    const people = await matching.getSuggestedPeople(carol.id, 2);
    expect(people).toHaveLength(2);
    expect(people[0]).toEqual(expect.objectContaining({ userId: expect.any(String), displayName: expect.stringMatching(/^Test contract-/), explanation: expect.any(String), score: 100 }));
    expect(await matching.getSuggestedPeople(carol.id, 0)).toEqual([]);
  });

  it('getCompatibilityScore works on plain SharablePreferences', () => {
    const base = { userId: 'x', interests: ['pottery'], availabilitySlots: ['thu_eve' as const], socialGoals: ['make_friends' as const], groupSizePref: 'small' as const, budgetMin: null, budgetMax: null, travelRadiusKm: 5, activityPrefs: [], coarseLat: 37.76, coarseLng: -122.42, neighborhood: null };
    expect(matching.getCompatibilityScore(base, { ...base, userId: 'y' }).hardFilterFailed).toBeNull();
  });
});

describe('getGroupVenueRequest for 04 (P1)', () => {
  it('returns aggregates for a voted new activity that needs a venue, and nothing otherwise', async () => {
    const suggestions = [
      { kind: 'new_activity', eventId: null, title: 'Wheel night', description: 'Throw bowls', category: 'creative', slot: 'thu_eve', estimatedCostCents: 2500, whyItFits: 'Pottery', needsVenue: true },
      { kind: 'new_activity', eventId: null, title: 'Walk', description: 'Loop', category: 'outdoors', slot: 'thu_eve', estimatedCostCents: 0, whyItFits: 'Outdoors', needsVenue: false },
    ];
    const { data: plan } = await admin.from('group_plans').insert({ group_id: privateId, requested_by: alice.id, request_text: 'x', suggestions, members_included: 2 }).select('id').single();
    expect(await groups.getGroupVenueRequest(privateId, plan!.id, 0)).toBeNull();
    await admin.from('group_plan_votes').insert({ plan_id: plan!.id, suggestion_index: 0, user_id: alice.id });
    const request = await groups.getGroupVenueRequest(privateId, plan!.id, 0);
    expect(request).toMatchObject({ title: 'Wheel night', category: 'creative', slot: 'thu_eve', memberCount: 2, votes: 1, budgetMaxCents: 2500, neighborhoodLabel: testOrigin().neighborhood, groupSizeMode: 'small', activityPrefs: ['beginner-friendly'], centerLat: testOrigin().lat, centerLng: testOrigin().lng });
    expect(JSON.stringify(request)).not.toContain(alice.id);
    expect(await groups.getGroupVenueRequest(privateId, plan!.id, 1)).toBeNull();
    expect(await groups.getGroupVenueRequest(privateId, plan!.id, 7)).toBeNull();
    expect(await groups.getGroupVenueRequest(publicId, plan!.id, 0)).toBeNull();
  });
});

describe('06 stand-ins on a branch without events tables', () => {
  it('return nothing instead of failing', async () => {
    expect(await sixStubs.getUpcomingEventsForUser(alice.id)).toEqual([]);
    expect(await sixStubs.getEventPublic(EVENT_ID)).toBeNull();
  });
});
