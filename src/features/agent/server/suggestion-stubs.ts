import "server-only";
import type { SharablePreferences } from "@/shared/types";

/**
 * The only remaining stand-in: event suggestions, until 06 (`getRecommendedEvents`) reaches main.
 * People (./people.ts) and groups (./groups.ts, 03's export) are real. Card types live here.
 */

export type PersonCandidate = { id: string; displayName: string; neighborhood: string; preferences: SharablePreferences };
export type EventCandidate = { id: string; title: string; startsAt: string; venue: string; category: string; description: string };
export type GroupCandidate = { id: string; name: string; description: string; memberCount: number };

const EVENTS: readonly EventCandidate[] = [
  {
    id: "00000000-0000-4000-8000-000000000601",
    title: "Beginner Pottery & Coffee Night",
    startsAt: "2026-10-29T19:00:00-07:00",
    venue: "Kiln & Cup",
    category: "creative",
    description: "Throw your first bowl with coffee on the side. Small group, beginner-friendly.",
  },
  {
    id: "00000000-0000-4000-8000-000000000602",
    title: "Friday Board Game Social",
    startsAt: "2026-10-30T19:00:00-07:00",
    venue: "Meeple House",
    category: "games",
    description: "Easy-to-learn board games with friendly strangers.",
  },
];


export async function suggestEvents(_userId: string, limit = 3): Promise<EventCandidate[]> {
  return EVENTS.slice(0, limit);
}

