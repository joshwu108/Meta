import { beforeEach, describe, expect, it } from 'vitest';
import type { ApiError } from '@/lib/api/errors';
import { toCapabilities } from '@/features/business/server/businesses';
import {
  cancelBusinessEvent,
  createManualEvent,
  getBusinessEvent,
  getEventAttendees,
  listBusinessEvents,
  publishBusinessEvent,
  updateBusinessEvent,
  type VenueContext,
} from '@/features/business/server/events';
import { MemoryBusinessStore } from '../../support/memory-store';
import { testDeps, type TestDeps } from '../../support/fixtures';

const MANUAL = {
  title: 'Open Studio Evening',
  description: 'Drop in, throw a pot, meet people.',
  category: 'creative' as const,
  format: 'Open studio',
  startsAt: '2026-10-29T18:00:00.000Z',
  endsAt: '2026-10-29T20:00:00.000Z',
  capacity: 10,
  priceCents: 1800,
  publish: false,
};

describe('business events', () => {
  let store: MemoryBusinessStore;
  let deps: TestDeps;
  let businessId: string;
  let venue: VenueContext;

  beforeEach(() => {
    store = new MemoryBusinessStore();
    const seeded = store.seedBusiness({ owner_id: 'owner-1' });
    businessId = seeded.business.id;
    venue = { capabilities: toCapabilities(seeded.capabilities), hours: seeded.business.hours };
    deps = testDeps(store);
  });

  const codeOf = async (fn: () => Promise<unknown>): Promise<string | undefined> => {
    try {
      await fn();
    } catch (err) {
      return (err as ApiError).code;
    }
    return undefined;
  };

  describe('create', () => {
    it('creates a manual event as an approved draft', async () => {
      const event = await createManualEvent(deps, businessId, venue, MANUAL);
      expect(event.status).toBe('approved_draft');
      expect(event.source).toBe('business_manual');
      expect(event.proposalId).toBeNull();
      expect(event.confirmedCount).toBe(0);
    });

    it('publishes straight away when asked', async () => {
      const event = await createManualEvent(deps, businessId, venue, { ...MANUAL, publish: true });
      expect(event.status).toBe('published');
      expect(event.publishedAt).not.toBeNull();
    });

    it('does not notify a cohort for a manual event', async () => {
      await createManualEvent(deps, businessId, venue, { ...MANUAL, publish: true });
      expect(deps.notifications).toEqual([]);
    });

    it('rejects an event the venue cannot host', async () => {
      expect(await codeOf(() => createManualEvent(deps, businessId, venue, { ...MANUAL, capacity: 99 }))).toBe(
        'VALIDATION',
      );
    });

    it('rejects an event outside opening hours', async () => {
      expect(
        await codeOf(() =>
          createManualEvent(deps, businessId, venue, {
            ...MANUAL,
            startsAt: '2026-10-29T23:00:00.000Z',
            endsAt: '2026-10-30T01:00:00.000Z',
          }),
        ),
      ).toBe('VALIDATION');
    });
  });

  describe('publish', () => {
    it('refuses to publish an already published event', async () => {
      const event = await createManualEvent(deps, businessId, venue, { ...MANUAL, publish: true });
      expect(await codeOf(() => publishBusinessEvent(deps, businessId, event.id))).toBe('CONFLICT');
    });

    it('hides another owner event behind NOT_FOUND', async () => {
      const event = await createManualEvent(deps, businessId, venue, MANUAL);
      const other = store.seedBusiness({ owner_id: 'owner-2', slug: 'other' });
      expect(await codeOf(() => publishBusinessEvent(deps, other.business.id, event.id))).toBe('NOT_FOUND');
    });

    it('reports a missing event as NOT_FOUND', async () => {
      expect(await codeOf(() => getBusinessEvent(deps, businessId, 'evt-missing'))).toBe('NOT_FOUND');
    });
  });

  describe('update', () => {
    it('applies an edit and leaves untouched fields alone', async () => {
      const event = await createManualEvent(deps, businessId, venue, MANUAL);
      const updated = await updateBusinessEvent(deps, businessId, event.id, venue, { title: 'Open Studio Night' });
      expect(updated.title).toBe('Open Studio Night');
      expect(updated.priceCents).toBe(1800);
    });

    it('notifies every confirmed attendee when the time changes', async () => {
      const event = await createManualEvent(deps, businessId, venue, { ...MANUAL, publish: true });
      store.seedRsvp(event.id, { user_id: 'user-a' });
      store.seedRsvp(event.id, { user_id: 'user-b' });
      store.seedRsvp(event.id, { user_id: 'user-c', status: 'cancelled' });

      await updateBusinessEvent(deps, businessId, event.id, venue, { startsAt: '2026-10-29T19:00:00.000Z' });

      expect(deps.notifications.map((n) => n.userId).sort()).toEqual(['user-a', 'user-b']);
      expect(deps.notifications[0]?.type).toBe('event_updated');
      expect(deps.notifications[0]?.payload.changed).toEqual(['startsAt']);
    });

    it('does not notify anyone for a title-only edit', async () => {
      const event = await createManualEvent(deps, businessId, venue, { ...MANUAL, publish: true });
      store.seedRsvp(event.id, { user_id: 'user-a' });
      await updateBusinessEvent(deps, businessId, event.id, venue, { title: 'Open Studio Night' });
      expect(deps.notifications).toEqual([]);
    });

    it('refuses to shrink capacity below the confirmed count', async () => {
      const event = await createManualEvent(deps, businessId, venue, { ...MANUAL, publish: true });
      store.seedRsvp(event.id, { user_id: 'user-a' });
      store.seedRsvp(event.id, { user_id: 'user-b' });
      store.seedRsvp(event.id, { user_id: 'user-c' });

      expect(await codeOf(() => updateBusinessEvent(deps, businessId, event.id, venue, { capacity: 2 }))).toBe(
        'VALIDATION',
      );
      expect((await getBusinessEvent(deps, businessId, event.id)).capacity).toBe(10);
    });

    it('allows a capacity increase with attendees on the list', async () => {
      const event = await createManualEvent(deps, businessId, venue, { ...MANUAL, publish: true });
      store.seedRsvp(event.id, { user_id: 'user-a' });
      const updated = await updateBusinessEvent(deps, businessId, event.id, venue, { capacity: 12 });
      expect(updated.capacity).toBe(12);
    });

    it('refuses to edit a cancelled event', async () => {
      const event = await createManualEvent(deps, businessId, venue, { ...MANUAL, publish: true });
      await cancelBusinessEvent(deps, businessId, event.id, 'Kiln broke');
      expect(await codeOf(() => updateBusinessEvent(deps, businessId, event.id, venue, { capacity: 4 }))).toBe(
        'CONFLICT',
      );
    });

    it('is a no-op when the edit changes nothing', async () => {
      const event = await createManualEvent(deps, businessId, venue, MANUAL);
      const updated = await updateBusinessEvent(deps, businessId, event.id, venue, { title: MANUAL.title });
      expect(updated).toEqual(event);
      expect(deps.notifications).toEqual([]);
    });
  });

  describe('cancel', () => {
    it('cancels with a reason and notifies confirmed attendees', async () => {
      const event = await createManualEvent(deps, businessId, venue, { ...MANUAL, publish: true });
      store.seedRsvp(event.id, { user_id: 'user-a' });
      store.seedRsvp(event.id, { user_id: 'user-b', status: 'waitlisted' });

      const cancelled = await cancelBusinessEvent(deps, businessId, event.id, 'Kiln broke');

      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.cancelReason).toBe('Kiln broke');
      expect(cancelled.cancelledAt).not.toBeNull();
      expect(deps.notifications).toEqual([
        {
          userId: 'user-a',
          type: 'event_cancelled',
          payload: { eventId: event.id, title: MANUAL.title, reason: 'Kiln broke' },
        },
      ]);
    });

    it('refuses to cancel a completed event', async () => {
      const row = store.seedEvent(
        {
          business_id: businessId,
          proposal_id: null,
          source: 'business_manual',
          title: MANUAL.title,
          description: MANUAL.description,
          category: 'creative',
          format: null,
          starts_at: MANUAL.startsAt,
          ends_at: MANUAL.endsAt,
          capacity: 10,
          price_cents: null,
        },
        'completed',
      );
      expect(await codeOf(() => cancelBusinessEvent(deps, businessId, row.id, 'too late'))).toBe('CONFLICT');
    });
  });

  describe('list and attendees', () => {
    it('lists the business own events with confirmed counts', async () => {
      const first = await createManualEvent(deps, businessId, venue, MANUAL);
      store.seedRsvp(first.id, { user_id: 'user-a' });
      const other = store.seedBusiness({ owner_id: 'owner-2', slug: 'other' });
      await createManualEvent(deps, other.business.id, venue, MANUAL);

      const list = await listBusinessEvents(deps, businessId);
      expect(list).toHaveLength(1);
      expect(list[0]?.confirmedCount).toBe(1);
    });

    it('returns counts plus only consented names', async () => {
      const event = await createManualEvent(deps, businessId, venue, MANUAL);
      store.seedRsvp(event.id, { user_id: 'user-a', share_with_business: true, display_name: 'Ada' });
      store.seedRsvp(event.id, { user_id: 'user-b', display_name: 'Grace' });
      store.seedRsvp(event.id, { user_id: 'user-c', status: 'waitlisted', display_name: 'Alan' });

      const attendees = await getEventAttendees(deps, businessId, event.id);
      expect(attendees.confirmedCount).toBe(2);
      expect(attendees.waitlistedCount).toBe(1);
      expect(attendees.attendees).toEqual([{ displayName: 'Ada' }, { displayName: null }]);
      expect(JSON.stringify(attendees)).not.toContain('Grace');
      expect(JSON.stringify(attendees)).not.toContain('user-');
    });

    it('hides another owner attendee list', async () => {
      const event = await createManualEvent(deps, businessId, venue, MANUAL);
      const other = store.seedBusiness({ owner_id: 'owner-2', slug: 'other' });
      expect(await codeOf(() => getEventAttendees(deps, other.business.id, event.id))).toBe('NOT_FOUND');
    });

    it('reports zero confirmed when workstream 06 has not landed its rsvps', async () => {
      const event = await createManualEvent(deps, businessId, venue, MANUAL);
      expect((await getEventAttendees(deps, businessId, event.id)).confirmedCount).toBe(0);
    });
  });
});
