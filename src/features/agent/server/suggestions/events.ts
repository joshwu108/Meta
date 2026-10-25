import "server-only";
import type { EventCandidate } from "./types";

/**
 * `suggest_events` from 06's `getRecommendedEvents` (ranked, consent-aware, live events only), so
 * agent event cards deep-link to real `/events/:id` pages.
 */
export type RecommendedLike = {
  event: { id: string; title: string; startsAt: string; category: string; description: string; business: { name: string } };
};

export type EventsDeps = { recommended: (viewerId: string, limit: number) => Promise<RecommendedLike[]> };

export async function suggestEventsFrom(deps: EventsDeps, viewerId: string, limit = 3): Promise<EventCandidate[]> {
  return (await deps.recommended(viewerId, limit)).map(({ event }) => ({
    id: event.id,
    title: event.title,
    startsAt: event.startsAt,
    venue: event.business.name,
    category: event.category,
    description: event.description,
  }));
}

/** Production wiring to 06's `@/features/events` contract. */
export async function suggestEvents(viewerId: string, limit = 3): Promise<EventCandidate[]> {
  const { getRecommendedEvents } = await import("@/features/events");
  return suggestEventsFrom({ recommended: getRecommendedEvents }, viewerId, limit);
}
