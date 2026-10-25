import "server-only";
import type { SharablePreferences } from "@/shared/types";

/**
 * Event suggestions come from 06's `getRecommendedEvents`; groups are still a stand-in for 03.
 * People suggestions use real consented users (see ./people.ts).
 */

export type PersonCandidate = { id: string; displayName: string; neighborhood: string; preferences: SharablePreferences };
export type EventCandidate = { id: string; title: string; startsAt: string; venue: string; category: string; description: string };
export type GroupCandidate = { id: string; name: string; description: string; memberCount: number };

const GROUPS: readonly GroupCandidate[] = [
  {
    id: "00000000-0000-4000-8000-000000000301",
    name: "Mission Makers",
    description: "Pottery, painting and crafts on Thursday evenings in the Mission.",
    memberCount: 4,
  },
];

export async function suggestEvents(userId: string, limit = 3): Promise<EventCandidate[]> {
  // Lazy import: 06 reads 02's sharable preferences, so a static import would be circular.
  const { getRecommendedEvents } = await import("@/features/events");
  const recommended = await getRecommendedEvents(userId, limit).catch(() => []);
  return recommended.map(({ event }) => ({
    id: event.id,
    title: event.title,
    startsAt: event.startsAt,
    venue: event.business.name,
    category: event.category,
    description: event.description,
  }));
}

export async function suggestGroups(_userId: string, limit = 3): Promise<GroupCandidate[]> {
  return GROUPS.slice(0, limit);
}
