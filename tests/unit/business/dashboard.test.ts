import { beforeEach, describe, expect, it } from 'vitest';
import { getDashboard } from '@/features/business/server/dashboard';
import { MemoryBusinessStore } from '../../support/memory-store';
import { PENDING_PROPOSAL, testDeps, type TestDeps } from '../../support/fixtures';
import type { NewEvent } from '@/features/business/server/store';

const NOW = new Date('2026-11-10T12:00:00Z');

const event = (over: Partial<NewEvent> & { business_id: string }): NewEvent => ({
  proposal_id: null,
  source: 'business_manual',
  title: 'Open Studio Evening',
  description: 'Drop in and throw a pot.',
  category: 'creative',
  format: null,
  starts_at: '2026-11-12T18:00:00.000Z',
  ends_at: '2026-11-12T20:00:00.000Z',
  capacity: 10,
  price_cents: 1800,
  ...over,
});

/** Spec section 7, Screen 2. */
describe('dashboard data', () => {
  let store: MemoryBusinessStore;
  let deps: TestDeps;
  let businessId: string;

  beforeEach(() => {
    store = new MemoryBusinessStore();
    businessId = store.seedBusiness({ owner_id: 'owner-1' }).business.id;
    deps = testDeps(store, NOW);
  });

  it('is empty for a brand new venue', async () => {
    const data = await getDashboard(deps, businessId);
    expect(data).toEqual({
      stats: { pendingProposals: 0, upcomingEvents: 0, rsvpsThisMonth: 0 },
      pending: [],
      upcoming: [],
      needsAttention: [],
    });
  });

  it('counts pending proposals', async () => {
    store.seedProposal(PENDING_PROPOSAL(businessId));
    store.seedProposal(PENDING_PROPOSAL(businessId));
    const data = await getDashboard(deps, businessId);
    expect(data.stats.pendingProposals).toBe(2);
    expect(data.pending).toHaveLength(2);
  });

  it('counts only future live events as upcoming', async () => {
    store.seedEvent(event({ business_id: businessId }), 'published');
    store.seedEvent(
      event({ business_id: businessId, starts_at: '2026-11-01T18:00:00.000Z', ends_at: '2026-11-01T20:00:00.000Z' }),
      'published',
    );
    store.seedEvent(event({ business_id: businessId, title: 'Cancelled night' }), 'cancelled');

    const data = await getDashboard(deps, businessId);
    expect(data.stats.upcomingEvents).toBe(1);
    expect(data.upcoming[0]?.title).toBe('Open Studio Evening');
  });

  it('orders upcoming events soonest first', async () => {
    store.seedEvent(
      event({ business_id: businessId, title: 'Later', starts_at: '2026-11-20T18:00:00.000Z', ends_at: '2026-11-20T20:00:00.000Z' }),
      'published',
    );
    store.seedEvent(
      event({ business_id: businessId, title: 'Sooner', starts_at: '2026-11-11T18:00:00.000Z', ends_at: '2026-11-11T20:00:00.000Z' }),
      'published',
    );
    const data = await getDashboard(deps, businessId);
    expect(data.upcoming.map((e) => e.title)).toEqual(['Sooner', 'Later']);
  });

  it('sums the rsvps of events starting this month', async () => {
    const thisMonth = store.seedEvent(event({ business_id: businessId }), 'published');
    const lastMonth = store.seedEvent(
      event({ business_id: businessId, starts_at: '2026-10-12T18:00:00.000Z', ends_at: '2026-10-12T20:00:00.000Z' }),
      'completed',
    );
    store.seedRsvp(thisMonth.id, { user_id: 'user-a' });
    store.seedRsvp(thisMonth.id, { user_id: 'user-b' });
    store.seedRsvp(lastMonth.id, { user_id: 'user-c' });

    const data = await getDashboard(deps, businessId);
    expect(data.stats.rsvpsThisMonth).toBe(2);
  });

  it('flags drafts and finished events as needing attention', async () => {
    store.seedEvent(event({ business_id: businessId, title: 'Still a draft' }), 'approved_draft');
    store.seedEvent(
      event({
        business_id: businessId,
        title: 'Already over',
        starts_at: '2026-11-01T18:00:00.000Z',
        ends_at: '2026-11-01T20:00:00.000Z',
      }),
      'published',
    );
    store.seedEvent(event({ business_id: businessId, title: 'Coming up' }), 'published');

    const data = await getDashboard(deps, businessId);
    expect(data.needsAttention.map((e) => e.title).sort()).toEqual(['Already over', 'Still a draft']);
  });

  it('never mixes in another venue data', async () => {
    const other = store.seedBusiness({ owner_id: 'owner-2', slug: 'other' }).business.id;
    store.seedEvent(event({ business_id: other }), 'published');
    store.seedProposal(PENDING_PROPOSAL(other));

    const data = await getDashboard(deps, businessId);
    expect(data.stats).toEqual({ pendingProposals: 0, upcomingEvents: 0, rsvpsThisMonth: 0 });
  });
});
