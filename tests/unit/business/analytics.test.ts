import { beforeEach, describe, expect, it } from 'vitest';
import type { ApiError } from '@/lib/api/errors';
import { MAX_RECENT_EVENTS, getBusinessAnalytics } from '@/features/business/server/analytics';
import type { NewEvent } from '@/features/business/server/store';
import type { EventStatus } from '@/shared/enums';
import { MemoryBusinessStore } from '../../support/memory-store';
import { testDeps, type TestDeps } from '../../support/fixtures';

const NOW = new Date('2026-11-10T12:00:00Z');

const past = (
  over: Partial<NewEvent> & { business_id: string },
): NewEvent => ({
  proposal_id: null,
  source: 'business_manual',
  title: 'Open Studio Evening',
  description: 'Drop in and throw a pot.',
  category: 'creative',
  format: null,
  starts_at: '2026-11-05T18:00:00.000Z',
  ends_at: '2026-11-05T20:00:00.000Z',
  capacity: 10,
  price_cents: 1800,
  ...over,
});

/** Spec section 3, P1 analytics: past events, attendance, repeat attendees (count only). */
describe('business analytics', () => {
  let store: MemoryBusinessStore;
  let deps: TestDeps;
  let businessId: string;

  beforeEach(() => {
    store = new MemoryBusinessStore();
    businessId = store.seedBusiness({ owner_id: 'owner-1' }).business.id;
    deps = testDeps(store, NOW);
  });

  const seed = (over: Partial<NewEvent> = {}, status: EventStatus = 'completed') =>
    store.seedEvent(past({ business_id: businessId, ...over }), status);

  it('is all zeroes for a venue that has hosted nothing', async () => {
    const analytics = await getBusinessAnalytics(deps, businessId);
    expect(analytics).toEqual({
      pastEvents: 0,
      totalAttendance: 0,
      averageFillRate: 0,
      repeatAttendees: 0,
      byCategory: [],
      recent: [],
    });
  });

  it('counts only events that are over and were not cancelled', async () => {
    seed({ title: 'Completed' }, 'completed');
    seed({ title: 'Finished but still published' }, 'published');
    seed({ title: 'Cancelled' }, 'cancelled');
    seed(
      { title: 'Still to come', starts_at: '2026-11-20T18:00:00.000Z', ends_at: '2026-11-20T20:00:00.000Z' },
      'published',
    );

    const analytics = await getBusinessAnalytics(deps, businessId);
    expect(analytics.pastEvents).toBe(2);
    expect(analytics.recent.map((e) => e.title).sort()).toEqual([
      'Completed',
      'Finished but still published',
    ]);
  });

  it('sums attendance and averages the fill rate', async () => {
    const first = seed({ title: 'Half full', capacity: 10 });
    const second = seed({ title: 'Full', capacity: 4 });
    for (const user of ['a', 'b', 'c', 'd', 'e']) store.seedRsvp(first.id, { user_id: `user-${user}` });
    for (const user of ['a', 'b', 'c', 'd']) store.seedRsvp(second.id, { user_id: `user-${user}` });

    const analytics = await getBusinessAnalytics(deps, businessId);
    expect(analytics.totalAttendance).toBe(9);
    expect(analytics.averageFillRate).toBe(0.75); // (0.5 + 1.0) / 2
  });

  it('ignores cancelled and waitlisted rsvps in attendance', async () => {
    const event = seed({ capacity: 10 });
    store.seedRsvp(event.id, { user_id: 'user-a' });
    store.seedRsvp(event.id, { user_id: 'user-b', status: 'waitlisted' });
    store.seedRsvp(event.id, { user_id: 'user-c', status: 'cancelled' });

    const analytics = await getBusinessAnalytics(deps, businessId);
    expect(analytics.totalAttendance).toBe(1);
  });

  it('counts repeat attendees only across events that have finished', async () => {
    // "Events hosted 0 · People who came 0 · Came back again 5" is not a thing that can be
    // true. The repeat count has to share the scope of the other two stats.
    const upcoming = seed(
      { title: 'Still to come', starts_at: '2026-11-20T18:00:00.000Z', ends_at: '2026-11-20T20:00:00.000Z' },
      'published',
    );
    store.seedRsvp(upcoming.id, { user_id: 'user-a' });
    store.seedRsvp(upcoming.id, { user_id: 'user-b' });
    const alsoUpcoming = seed(
      { title: 'Also to come', starts_at: '2026-11-21T18:00:00.000Z', ends_at: '2026-11-21T20:00:00.000Z' },
      'published',
    );
    store.seedRsvp(alsoUpcoming.id, { user_id: 'user-a' });
    store.seedRsvp(alsoUpcoming.id, { user_id: 'user-b' });

    const analytics = await getBusinessAnalytics(deps, businessId);
    expect(analytics.pastEvents).toBe(0);
    expect(analytics.totalAttendance).toBe(0);
    expect(analytics.repeatAttendees).toBe(0);
  });

  it('counts repeat attendees without naming anyone', async () => {
    const first = seed({ title: 'First' });
    const second = seed({ title: 'Second' });
    store.seedRsvp(first.id, { user_id: 'user-a', display_name: 'Ada', share_with_business: true });
    store.seedRsvp(second.id, { user_id: 'user-a', display_name: 'Ada', share_with_business: true });
    store.seedRsvp(first.id, { user_id: 'user-b' });

    const analytics = await getBusinessAnalytics(deps, businessId);
    expect(analytics.repeatAttendees).toBe(1);
    const serialized = JSON.stringify(analytics);
    expect(serialized).not.toContain('user-a');
    expect(serialized).not.toContain('Ada');
  });

  it('groups past events by category', async () => {
    seed({ title: 'Pottery', category: 'creative', capacity: 10 });
    seed({ title: 'Tasting', category: 'food_drink', capacity: 10 });
    seed({ title: 'More pottery', category: 'creative', capacity: 10 });
    const withOne = seed({ title: 'Games', category: 'games', capacity: 10 });
    store.seedRsvp(withOne.id, { user_id: 'user-a' });

    const analytics = await getBusinessAnalytics(deps, businessId);
    expect(analytics.byCategory).toEqual([
      { category: 'creative', events: 2, attendance: 0 },
      { category: 'food_drink', events: 1, attendance: 0 },
      { category: 'games', events: 1, attendance: 1 },
    ]);
  });

  it('lists the most recent past events first and caps the list', async () => {
    // All in October so every one of them is already over relative to NOW.
    for (let day = 1; day <= MAX_RECENT_EVENTS + 3; day += 1) {
      const date = String(day).padStart(2, '0');
      seed({
        title: `Night ${day}`,
        starts_at: `2026-10-${date}T18:00:00.000Z`,
        ends_at: `2026-10-${date}T20:00:00.000Z`,
      });
    }
    const analytics = await getBusinessAnalytics(deps, businessId);
    expect(analytics.recent).toHaveLength(MAX_RECENT_EVENTS);
    expect(analytics.recent[0]?.title).toBe(`Night ${MAX_RECENT_EVENTS + 3}`);
  });

  it('reports a fill rate per past event', async () => {
    const event = seed({ capacity: 8 });
    for (const user of ['a', 'b']) store.seedRsvp(event.id, { user_id: `user-${user}` });
    const analytics = await getBusinessAnalytics(deps, businessId);
    expect(analytics.recent[0]).toMatchObject({ capacity: 8, confirmedCount: 2, fillRate: 0.25 });
  });

  it('treats a zero-capacity event as zero fill rather than dividing by zero', async () => {
    store.seedEvent({ ...past({ business_id: businessId }), capacity: 0 }, 'completed');
    const analytics = await getBusinessAnalytics(deps, businessId);
    expect(analytics.averageFillRate).toBe(0);
    expect(analytics.recent[0]?.fillRate).toBe(0);
  });

  it('never counts another venue events', async () => {
    const other = store.seedBusiness({ owner_id: 'owner-2', slug: 'other' }).business.id;
    store.seedEvent(past({ business_id: other }), 'completed');
    expect((await getBusinessAnalytics(deps, businessId)).pastEvents).toBe(0);
  });

  it('fails with NOT_FOUND for a business that does not exist', async () => {
    try {
      await getBusinessAnalytics(deps, 'biz-missing');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as ApiError).code).toBe('NOT_FOUND');
    }
  });
});
