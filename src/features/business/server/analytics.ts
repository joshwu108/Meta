import 'server-only';
import { ApiError } from '@/lib/api/errors';
import type { EventCategory } from '@/shared/enums';
import type { BusinessDeps } from './deps';
import { listBusinessEvents } from './events';

/**
 * P1 analytics (spec section 3): past events, attendance, and repeat attendees **as a count
 * only**. No user id and no name appears anywhere in this module's output — a business sees
 * how many people came back, never who they were.
 */

export const MAX_RECENT_EVENTS = 10;

export type CategoryBreakdown = { category: EventCategory; events: number; attendance: number };

export type PastEventSummary = {
  id: string;
  title: string;
  startsAt: string;
  capacity: number;
  confirmedCount: number;
  fillRate: number;
};

export type BusinessAnalytics = {
  pastEvents: number;
  totalAttendance: number;
  averageFillRate: number;
  repeatAttendees: number;
  byCategory: CategoryBreakdown[];
  recent: PastEventSummary[];
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

const fillRateOf = (confirmed: number, capacity: number): number =>
  capacity > 0 ? round2(confirmed / capacity) : 0;

export async function getBusinessAnalytics(
  deps: BusinessDeps,
  businessId: string,
): Promise<BusinessAnalytics> {
  const business = await deps.store.findBusinessById(businessId);
  if (!business) throw new ApiError('NOT_FOUND', 'business does not exist');

  const now = deps.now().toISOString();
  const events = await listBusinessEvents(deps, businessId);

  // "Past" is behavioural, not a status: the event is over and it was not called off.
  const finished = events.filter((event) => event.endsAt < now && event.status !== 'cancelled');

  const byCategory = [...
    finished.reduce<Map<EventCategory, CategoryBreakdown>>((acc, event) => {
      const current = acc.get(event.category);
      return new Map(acc).set(event.category, {
        category: event.category,
        events: (current?.events ?? 0) + 1,
        attendance: (current?.attendance ?? 0) + event.confirmedCount,
      });
    }, new Map())
      .values(),
  ].sort((a, b) => a.category.localeCompare(b.category));

  const totalAttendance = finished.reduce((total, event) => total + event.confirmedCount, 0);
  const fillRates = finished.map((event) => fillRateOf(event.confirmedCount, event.capacity));

  return {
    pastEvents: finished.length,
    totalAttendance,
    averageFillRate:
      fillRates.length === 0
        ? 0
        : round2(fillRates.reduce((total, rate) => total + rate, 0) / fillRates.length),
    repeatAttendees: await deps.store.countRepeatAttendees(businessId),
    byCategory,
    recent: finished
      .slice()
      .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
      .slice(0, MAX_RECENT_EVENTS)
      .map((event) => ({
        id: event.id,
        title: event.title,
        startsAt: event.startsAt,
        capacity: event.capacity,
        confirmedCount: event.confirmedCount,
        fillRate: fillRateOf(event.confirmedCount, event.capacity),
      })),
  };
}
