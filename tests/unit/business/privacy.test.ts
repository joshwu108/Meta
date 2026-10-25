import { beforeEach, describe, expect, it } from 'vitest';
import { getBusinessAnalytics } from '@/features/business/server/analytics';
import { getBusinessPublicCardFor, getOwnerBusiness, toCapabilities } from '@/features/business/server/businesses';
import { findCandidateBusinesses } from '@/features/business/server/candidates';
import { getDashboard } from '@/features/business/server/dashboard';
import { getBusinessEvent, getEventAttendees, listBusinessEvents, type VenueContext } from '@/features/business/server/events';
import { getBusinessInsights } from '@/features/business/server/insights';
import { getBusinessProposal, listBusinessProposals } from '@/features/business/server/proposals';
import { decideProposal } from '@/features/proposals/server/decide';
import { MemoryBusinessStore } from '../../support/memory-store';
import { PENDING_PROPOSAL, testDeps, type TestDeps } from '../../support/fixtures';

/**
 * Spec section 10, criterion 3: "No route in this workstream returns user ids, raw cohort
 * counts, or non-consented names."
 *
 * Rather than trusting each DTO builder separately, this seeds the store with sentinel
 * values that must never be rendered, then serializes what every read path a route returns
 * actually produces. A new field that leaks one of them fails here, whichever module adds
 * it.
 */

const OWNER_ID = 'OWNER-SENTINEL-6ab3';
const CONSENTING_USER = 'USER-CONSENTED-SENTINEL-1f77';
const PRIVATE_USER = 'USER-PRIVATE-SENTINEL-2c91';
const PRIVATE_NAME = 'PrivateAttendeeSentinel';
const CLUSTER_ID = 'CLUSTER-SENTINEL-9de4';
const RAW_COHORT = 7919; // prime, so it cannot collide with a price, capacity or timestamp

/** Everything that must never appear in a payload a business receives. */
const FORBIDDEN = [OWNER_ID, CONSENTING_USER, PRIVATE_USER, PRIVATE_NAME, CLUSTER_ID, String(RAW_COHORT)];

const assertClean = (label: string, payload: unknown): void => {
  const serialized = JSON.stringify(payload) ?? '';
  for (const secret of FORBIDDEN) {
    expect(serialized, `${label} leaked ${secret}`).not.toContain(secret);
  }
};

describe('nothing a business receives carries a user id, a raw count or a private name', () => {
  let store: MemoryBusinessStore;
  let deps: TestDeps;
  let businessId: string;
  let venue: VenueContext;
  let eventId: string;
  let proposalId: string;

  beforeEach(async () => {
    store = new MemoryBusinessStore();
    const seeded = store.seedBusiness({ owner_id: OWNER_ID });
    businessId = seeded.business.id;
    venue = { capabilities: toCapabilities(seeded.capabilities), hours: seeded.business.hours };
    deps = testDeps(store);

    store.seedCluster(CLUSTER_ID, [CONSENTING_USER, PRIVATE_USER]);
    store.seedInsights([{ category: 'creative', slot: 'thu_eve', member_count: RAW_COHORT }]);

    proposalId = store.seedProposal({
      ...PENDING_PROPOSAL(businessId, CLUSTER_ID),
      proposal: {
        ...PENDING_PROPOSAL(businessId).proposal,
        demand: { band: '20+', neighborhoodLabel: 'Mission', topInterests: ['pottery'] },
      },
    }).id;

    const event = store.seedEvent(
      {
        business_id: businessId,
        proposal_id: null,
        source: 'business_manual',
        title: 'Open Studio Evening',
        description: 'Drop in and throw a pot.',
        category: 'creative',
        format: null,
        starts_at: '2026-10-29T18:00:00.000Z',
        ends_at: '2026-10-29T20:00:00.000Z',
        capacity: 10,
        price_cents: 1800,
      },
      'published',
    );
    eventId = event.id;

    store.seedRsvp(eventId, {
      user_id: CONSENTING_USER,
      share_with_business: true,
      display_name: 'Ada Lovelace',
      shared_interests: ['pottery'],
    });
    store.seedRsvp(eventId, {
      user_id: PRIVATE_USER,
      share_with_business: false,
      display_name: PRIVATE_NAME,
    });
  });

  it('GET /api/business/me', async () => {
    assertClean('owner business', await getOwnerBusiness(deps, OWNER_ID));
  });

  it('getBusinessPublicCard, consumed by 04 and 06', async () => {
    assertClean('public card', await getBusinessPublicCardFor(deps, businessId));
  });

  it('GET /api/business/proposals', async () => {
    assertClean('proposal list', await listBusinessProposals(deps, businessId));
  });

  it('GET /api/business/proposals/:id', async () => {
    assertClean('proposal detail', await getBusinessProposal(deps, businessId, proposalId));
  });

  it('GET /api/business/events', async () => {
    assertClean('event list', await listBusinessEvents(deps, businessId));
  });

  it('GET /api/business/events/:id', async () => {
    assertClean('event detail', await getBusinessEvent(deps, businessId, eventId));
  });

  it('GET /api/business/events/:id/attendees', async () => {
    const attendees = await getEventAttendees(deps, businessId, eventId);
    assertClean('attendee list', attendees);
    // The consented name is the one thing that may appear.
    expect(attendees.attendees).toEqual([
      { displayName: 'Ada Lovelace', sharedInterests: ['pottery'] },
      { displayName: null },
    ]);
    expect(attendees.confirmedCount).toBe(2);
  });

  it('GET /api/business/insights', async () => {
    const insights = await getBusinessInsights(deps, businessId);
    assertClean('insights', insights);
    expect(insights.cells[0]?.band).toBe('20+');
  });

  it('the insights page analytics', async () => {
    assertClean('analytics', await getBusinessAnalytics(deps, businessId));
  });

  it('the dashboard', async () => {
    assertClean('dashboard', await getDashboard(deps, businessId));
  });

  it('PATCH /api/business/proposals/:id, including the published event', async () => {
    const result = await decideProposal(deps, businessId, venue, proposalId, {
      decision: 'approve',
      publish: true,
    });
    assertClean('decision result', result);
    // The cohort was still notified, through ids that never entered the payload.
    expect(deps.notifications.map((n) => n.userId).sort()).toEqual(
      [CONSENTING_USER, PRIVATE_USER].sort(),
    );
  });

  it('findCandidateBusinesses, consumed by 04', async () => {
    const matches = await findCandidateBusinesses(
      {
        category: 'creative',
        cohortSize: 6,
        slot: 'thu_eve',
        centerLat: 37.76,
        centerLng: -122.42,
        radiusKm: 3,
        budgetMax: 3000,
      },
      async () => [
        {
          business_id: businessId,
          name: 'Kiln & Cup',
          category: 'creative',
          neighborhood: 'Mission',
          address: '1 Valencia St',
          description: 'Pottery studio',
          image_url: null,
          hours: {},
          capacity: 12,
          event_categories: ['creative'],
          hosting_slots: ['thu_eve'],
          equipment_tags: ['kiln'],
          formats: ['workshop'],
          min_price_cents: 1500,
          max_price_cents: 3500,
          distance_km: 0.4,
        },
      ],
    );
    assertClean('candidate matches', matches);
    expect(matches).toHaveLength(1);
  });

  it('the sentinels really would have been caught', () => {
    // Guards the guard: assertClean must fail on a payload that does leak.
    expect(() => assertClean('poisoned', { ownerId: OWNER_ID })).toThrow();
    expect(() => assertClean('poisoned', { memberCount: RAW_COHORT })).toThrow();
    expect(() => assertClean('poisoned', { attendee: PRIVATE_NAME })).toThrow();
  });
});
