import { describe, expect, it, vi } from "vitest";
import { rankEvents, type CandidateEvent, type ViewerPreferences } from "@/features/events/server/recommend";
import { localParts } from "@/features/events/server/slots";

vi.mock("server-only", () => ({}));

// AC1 regression guard on realistic data: 01's seeded events (supabase/seed/fixtures/events.json on
// ws/01-core), 05's Scene 4 pottery night (tests/fixtures/proposals/pottery-night.json on
// ws/05-business, price edited to $25), and 02's Scene 1 preferences (agent.extract_preferences.json).

const VENUES = {
  "kiln-and-cup": { lat: 37.7599, lng: -122.4148 },
  "ritual-grounds": { lat: 37.7765, lng: -122.4255 },
  "meeple-house": { lat: 37.7533, lng: -122.4842 },
};

const SEEDED = [
  { id: "wheel-throwing-basics", venue: "kiln-and-cup", title: "Wheel Throwing Basics", category: "creative", days: 2, hour: 18, capacity: 10, price: 3500, description: "Two hours at the wheel for complete beginners. Clay and firing included." },
  { id: "glaze-and-latte-sunday", venue: "kiln-and-cup", title: "Glaze & Latte Sunday", category: "creative", days: 5, hour: 11, capacity: 12, price: 2000, description: "Glaze your bisque-fired pieces over coffee. Bring a friend." },
  { id: "cupping-101", venue: "ritual-grounds", title: "Coffee Cupping 101", category: "food_drink", days: 3, hour: 18, capacity: 14, price: 1500, description: "Taste five single origins side by side and learn what you actually like." },
  { id: "slow-morning-book-swap", venue: "ritual-grounds", title: "Slow Morning Book Swap", category: "community", days: 9, hour: 10, capacity: 20, price: 0, description: "Bring a book, leave with a book, and meet neighbors who read." },
  { id: "catan-league-night", venue: "meeple-house", title: "Catan League Night", category: "games", days: 4, hour: 19, capacity: 24, price: 1000, description: "Four tables, rotating seats, friendly rivalry. Beginners welcome." },
  { id: "newcomers-game-night", venue: "meeple-house", title: "Newcomers Game Night", category: "games", days: 11, hour: 18, capacity: 30, price: 500, description: "For people new to the city. Light party games and name tags." },
] as const;

const SCENE1: ViewerPreferences = {
  userId: "demo.new",
  interests: ["pottery", "coffee"],
  availabilitySlots: ["thu_eve"],
  socialGoals: ["make_friends", "explore_city"],
  groupSizePref: "small",
  budgetMin: null,
  budgetMax: null,
  travelRadiusKm: 5,
  activityPrefs: ["beginner-friendly"],
  coarseLat: 37.76,
  coarseLng: -122.42,
  neighborhood: "Mission",
};

/** UTC ISO for a Pacific wall-clock time `days` after `base`, whichever of PDT/PST applies. */
function pacific(base: Date, days: number, hour: number, minute = 0): string {
  const day = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + days));
  for (const offset of [7, 8]) {
    const candidate = new Date(day.getTime() + ((hour + offset) * 60 + minute) * 60_000);
    if (localParts(candidate).hour === hour) return candidate.toISOString();
  }
  throw new Error("no matching offset");
}

function nextThursday(base: Date): number {
  const weekday = localParts(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 20))).weekday;
  return ((4 - weekday + 7) % 7) || 7;
}

function candidates(base: Date): CandidateEvent[] {
  const seeded = SEEDED.map((e): CandidateEvent => ({
    id: e.id, title: e.title, description: e.description, category: e.category, startsAt: pacific(base, e.days, e.hour),
    capacity: e.capacity, priceCents: e.price, venue: VENUES[e.venue], friendsGoing: 0, cancelledByViewer: false,
  }));
  const pottery: CandidateEvent = {
    id: "beginner-pottery-coffee-night",
    title: "Beginner Pottery & Coffee Night",
    description: "A guided wheel-throwing session for complete beginners. Everyone starts at the same place, hands stay busy, and the second half is coffee and easy conversation around the tables.",
    category: "creative", startsAt: pacific(base, nextThursday(base), 18, 30), capacity: 8, priceCents: 2500,
    venue: VENUES["kiln-and-cup"], friendsGoing: 0, cancelledByViewer: false,
  };
  return [...seeded, pottery];
}

describe("Scene 5 ranking on the real fixtures", () => {
  // Every weekday the demo could run on, so seeded events land on every possible slot.
  it.each([0, 1, 2, 3, 4, 5, 6])("puts the pottery night first when the demo runs %i days after a Sunday", (offset) => {
    const base = new Date(Date.UTC(2026, 10, 1 + offset, 20)); // 2026-11-01 is a Sunday
    const ranked = rankEvents(SCENE1, candidates(base));

    expect(ranked[0]!.event.id).toBe("beginner-pottery-coffee-night");
    expect(ranked[0]!.score! - ranked[1]!.score!).toBeGreaterThanOrEqual(5);
  });
});
