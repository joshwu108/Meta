import 'server-only';
import { getEventPublic, getUpcomingEventsForUser } from '@/features/events';
import type { CandidateEvent } from './fallback';
import type { Prework } from './prework';
import { slotForStart } from './slots';

const MAX_CANDIDATES = 8;
const MAX_LOOKUPS = 20;

/**
 * Spec §5 step 4: the requester's upcoming events (06's `getUpcomingEventsForUser`) that are open
 * for RSVPs, fall in a slot every consenting member shares, match the group's interest categories
 * and fit the budget envelope. Category and price come from 06's `getEventPublic`.
 */
export async function loadCandidateEvents(requesterId: string, prework: Prework): Promise<CandidateEvent[]> {
  if (prework.sharedSlots.length === 0) return [];
  const upcoming = await getUpcomingEventsForUser(requesterId);
  const inSlots = upcoming
    .filter((event) => event.status === 'published')
    .map((event) => ({ event, slot: slotForStart(event.startsAt) }))
    .filter((entry): entry is { event: (typeof upcoming)[number]; slot: NonNullable<typeof entry.slot> } =>
      entry.slot !== null && prework.sharedSlots.includes(entry.slot),
    )
    .slice(0, MAX_LOOKUPS);
  const details = await Promise.all(inSlots.map(({ event }) => getEventPublic(event.id)));
  const categories = new Set(prework.categories.map((c) => c.category));
  const budget = prework.budgetMaxCents;
  return inSlots
    .flatMap(({ event, slot }, i) => {
      const detail = details[i];
      if (!detail) return [];
      if (categories.size > 0 && !categories.has(detail.category)) return [];
      if (budget !== null && (detail.priceCents ?? 0) > budget) return [];
      return [{ id: event.id, title: event.title, category: detail.category, slot, startsAt: event.startsAt, venue: event.business.name, priceCents: detail.priceCents }];
    })
    .slice(0, MAX_CANDIDATES);
}
