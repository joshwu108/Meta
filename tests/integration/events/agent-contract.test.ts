import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { adminClient, createTestUser, type TestUser } from '../helpers';
import { cleanupSocialUsers, setProfile, setTestOrigin } from '../social/support';

/**
 * Workstream 06 reaches workstream 02 through `src/features/events/server/stubs/agent.ts`. Those
 * were stand-ins written while 02 was unmerged, and 06's own suites exercise them against its
 * pglite stand-in schema, so nothing here ever checked them against the real consent boundary.
 * These tests do: what 06 asks the agent for has to be what the agent actually answers.
 */

vi.mock('server-only', () => ({}));

const admin = adminClient();
setTestOrigin('events-agent-contract');

let sharer: TestUser;
let peer: TestUser;
let privateOne: TestUser;
let businessOwner: TestUser;
let eventId: string;

const { rsvpToEvent } = await import('@/features/events/server/rsvp');
const { getAttendeeList } = await import('@/features/events/server/attendees');
const agent = await import('@/features/agent');
const eventStubs = await import('@/features/events/server/stubs');

beforeAll(async () => {
  [sharer, peer, privateOne, businessOwner] = await Promise.all([
    createTestUser(admin, 'ev-sharer'),
    createTestUser(admin, 'ev-peer'),
    createTestUser(admin, 'ev-private'),
    createTestUser(admin, 'ev-owner'),
  ]);
  // Two attendees share interests with the room; the third does not.
  await setProfile(admin, sharer, { interests: ['pottery', 'coffee'] }, { matching: true });
  await setProfile(admin, peer, { interests: ['pottery', 'hiking'] }, { matching: true });
  await setProfile(admin, privateOne, { interests: ['board games'] }, { matching: true });
  const sharingConsent = {
    allow_matching: true,
    allow_demand_aggregation: false,
    allow_group_planning: false,
    share_interests_with_attendees: true,
    share_name_with_business: true,
  };
  await admin.from('agent_profiles').update({ consent: sharingConsent }).in('user_id', [sharer.id, peer.id]);

  const business = await admin
    .from('businesses')
    .insert({
      owner_id: businessOwner.id,
      name: 'Kiln & Cup (agent contract)',
      slug: `ws07-audit-${Date.now()}`,
      category: 'creative',
      address: '1 Valencia St',
      neighborhood: 'Mission',
      lat: 37.76,
      lng: -122.41,
      hours: { thu: [['09:00', '21:00']] },
    })
    .select('id')
    .single();
  if (business.error) throw new Error(business.error.message);

  const event = await admin
    .from('events')
    .insert({
      business_id: business.data.id,
      source: 'business_manual',
      title: 'Open Studio Evening',
      description: 'Drop in and throw a pot.',
      category: 'creative',
      starts_at: new Date(Date.now() + 3 * 24 * 3600_000).toISOString(),
      ends_at: new Date(Date.now() + 3 * 24 * 3600_000 + 7_200_000).toISOString(),
      capacity: 10,
      price_cents: 1800,
      status: 'published',
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (event.error) throw new Error(event.error.message);
  eventId = event.data.id;
}, 60_000);

afterAll(async () => {
  await admin.from('events').delete().eq('id', eventId);
  await admin.from('businesses').delete().eq('owner_id', businessOwner.id);
  await cleanupSocialUsers(admin);
});

describe('what 06 asks 02 for', () => {
  it('reads the viewer’s real consent, not a hardcoded set of flags', async () => {
    const consent = await eventStubs.getConsent(sharer.id);
    expect(consent).toEqual(await agent.getConsent(sharer.id));
    expect(consent.share_interests_with_attendees).toBe(true);
    expect(consent.share_name_with_business).toBe(true);
  });

  it('releases a consenting attendee’s interests, and withholds the other’s', async () => {
    const sharing = await eventStubs.getAttendeeSharing([sharer.id, privateOne.id]);
    expect(sharing.get(sharer.id)).toMatchObject({ shareInterestsWithAttendees: true });
    expect(sharing.get(sharer.id)?.interests.length ?? 0).toBeGreaterThan(0);
    expect(sharing.get(privateOne.id)).toMatchObject({
      shareInterestsWithAttendees: false,
      interests: [],
    });
  });

  it('explains a recommendation with the agent, not a template', async () => {
    const viewer = await agent.getSharablePreferences(sharer.id, 'matching');
    expect(viewer).not.toBeNull();
    const input = {
      viewer: viewer!,
      target: { kind: 'event' as const, event: { title: 'Open Studio Evening', slot: 'thu_eve' } },
      breakdown: { interest: 30, slot: 20 },
    };
    expect(await eventStubs.explainRecommendation(input)).toBe(await agent.explainRecommendation(input));
  });

  it('asks the agent for a follow-up instead of always proposing coffee', async () => {
    const [a, b] = await Promise.all([
      agent.getSharablePreferences(sharer.id, 'matching'),
      agent.getSharablePreferences(privateOne.id, 'matching'),
    ]);
    const input = {
      a: a!,
      b: b!,
      event: { title: 'Open Studio Evening', category: 'creative' as const, startsAt: new Date().toISOString() },
    };
    const viaEvents = await eventStubs.suggestFollowUp(input);
    const viaAgent = await agent.suggestFollowUp(input);
    expect(viaEvents.suggestedBusinessCategory).toBe(viaAgent.suggestedBusinessCategory);
    expect(viaEvents.title).toBe(viaAgent.title);
  });
});

describe('RSVP sharing defaults', () => {
  it('falls back to what the member actually consented to', async () => {
    await rsvpToEvent(sharer.client as never, sharer.id, eventId, {} as never);
    const { data } = await admin
      .from('rsvps')
      .select('share_with_attendees, share_with_business')
      .eq('event_id', eventId)
      .eq('user_id', sharer.id)
      .single();
    expect(data).toMatchObject({ share_with_attendees: true, share_with_business: true });
  });

  it('still lets an explicit choice override consent', async () => {
    await rsvpToEvent(privateOne.client as never, privateOne.id, eventId, {
      shareWithAttendees: true,
      shareWithBusiness: false,
    } as never);
    const { data } = await admin
      .from('rsvps')
      .select('share_with_attendees, share_with_business')
      .eq('event_id', eventId)
      .eq('user_id', privateOne.id)
      .single();
    expect(data).toMatchObject({ share_with_attendees: true, share_with_business: false });
  });

  it('shows what two consenting attendees have in common, and nothing from the third', async () => {
    await rsvpToEvent(peer.client as never, peer.id, eventId, {} as never);
    const list = await getAttendeeList(sharer.id, eventId);

    // Both consented to share interests, so the list shows the overlap between them.
    const theirs = list.attendees.find((row) => row.userId === peer.id);
    expect(theirs?.sharedInterests).toEqual(['pottery']);

    // This one shared their name but not their interests, so only the name is there.
    const quiet = list.attendees.find((row) => row.userId === privateOne.id);
    expect(quiet).toBeDefined();
    expect(quiet?.sharedInterests).toBeUndefined();
  });
});
