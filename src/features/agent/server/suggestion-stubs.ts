import "server-only";
import type { SharablePreferences } from "@/shared/types";

/**
 * Stand-ins for 03 (`GET /matches` logic, groups) and 06 (`getRecommendedEvents`)
 * returning seeded demo data. Replace with the real exports once 03/06 land.
 */

export type PersonCandidate = { id: string; displayName: string; neighborhood: string; preferences: SharablePreferences };
export type EventCandidate = { id: string; title: string; startsAt: string; venue: string; category: string; description: string };
export type GroupCandidate = { id: string; name: string; description: string; memberCount: number };

const person = (id: string, displayName: string, neighborhood: string, interests: string[]): PersonCandidate => ({
  id,
  displayName,
  neighborhood,
  preferences: {
    userId: id,
    interests,
    interestCategories: ["creative", "food_drink"],
    availabilitySlots: ["thu_eve"],
    socialGoals: ["make_friends"],
    groupSizePref: "small",
    budgetMin: null,
    budgetMax: 2500,
    travelRadiusKm: 5,
    activityPrefs: ["beginner-friendly"],
    coarseLat: 37.76,
    coarseLng: -122.42,
    neighborhood,
  },
});

const PEOPLE: readonly PersonCandidate[] = [
  person("00000000-0000-4000-8000-000000000101", "Maya", "Mission", ["pottery", "coffee", "painting"]),
  person("00000000-0000-4000-8000-000000000102", "Jordan", "Castro", ["ceramics", "coffee"]),
  person("00000000-0000-4000-8000-000000000103", "Priya", "Noe Valley", ["painting", "live-music"]),
];

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

const GROUPS: readonly GroupCandidate[] = [
  {
    id: "00000000-0000-4000-8000-000000000301",
    name: "Mission Makers",
    description: "Pottery, painting and crafts on Thursday evenings in the Mission.",
    memberCount: 4,
  },
];

export async function suggestPeople(_userId: string, limit = 3): Promise<PersonCandidate[]> {
  return PEOPLE.slice(0, limit);
}

export async function suggestEvents(_userId: string, limit = 3): Promise<EventCandidate[]> {
  return EVENTS.slice(0, limit);
}

export async function suggestGroups(_userId: string, limit = 3): Promise<GroupCandidate[]> {
  return GROUPS.slice(0, limit);
}
