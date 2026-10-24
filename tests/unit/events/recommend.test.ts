import { describe, expect, it } from "vitest";
import {
  capacityBucket,
  rankEvents,
  scoreEvent,
  type CandidateEvent,
  type ViewerPreferences,
} from "@/features/events/server/recommend";
import { haversineKm } from "@/features/events/server/geo";
import { categoriesForInterests } from "@/features/events/server/categories";

// Kiln & Cup in the Mission; viewer lives ~1 km away.
const VENUE = { lat: 37.7599, lng: -122.4148 };

const viewer: ViewerPreferences = {
  userId: "viewer",
  interests: ["pottery", "coffee"],
  interestCategories: ["creative", "food_drink"],
  availabilitySlots: ["thu_eve", "sat_day"],
  socialGoals: ["make_friends"],
  groupSizePref: "small",
  budgetMin: null,
  budgetMax: 3000,
  travelRadiusKm: 5,
  activityPrefs: ["beginner-friendly"],
  coarseLat: 37.76,
  coarseLng: -122.42,
  neighborhood: "Mission",
};

const pottery: CandidateEvent = {
  id: "pottery",
  title: "Beginner Pottery & Coffee Night",
  description: "Learn the wheel with coffee from Ritual Grounds.",
  category: "creative",
  startsAt: "2026-10-30T02:00:00Z", // Thu 19:00 PT
  capacity: 6,
  priceCents: 2500,
  venue: VENUE,
  friendsGoing: 0,
  cancelledByViewer: false,
};

describe("scoreEvent golden cases", () => {
  it("scores the Scene 5 pottery night near the top", () => {
    const { score, breakdown } = scoreEvent(viewer, pottery);
    expect(breakdown).toEqual({ interest: 40, slot: 25, budget: 15, proximity: 9.1, social: 7 });
    expect(score).toBe(96);
  });

  it("drops interest to the category share when no interest tag appears in the copy", () => {
    const painting = { ...pottery, title: "Watercolor Basics", description: "Paint a city skyline." };
    expect(scoreEvent(viewer, painting).breakdown.interest).toBe(26.7);
  });

  it("gives partial interest credit for a tag match outside the viewer's categories", () => {
    const tasting = { ...pottery, category: "games" as const, title: "Coffee & Catan" };
    expect(scoreEvent(viewer, tasting).breakdown.interest).toBe(13.3);
  });

  it("gives no slot credit for a weekday daytime event", () => {
    expect(scoreEvent(viewer, { ...pottery, startsAt: "2026-10-28T19:00:00Z" }).breakdown.slot).toBe(0);
  });

  it("treats free events as within any budget and expensive ones as outside it", () => {
    expect(scoreEvent(viewer, { ...pottery, priceCents: null }).breakdown.budget).toBe(15);
    expect(scoreEvent(viewer, { ...pottery, priceCents: 0 }).breakdown.budget).toBe(15);
    expect(scoreEvent(viewer, { ...pottery, priceCents: 4500 }).breakdown.budget).toBe(0);
  });

  it("gives half budget credit when the viewer has not set a budget", () => {
    expect(scoreEvent({ ...viewer, budgetMax: null }, pottery).breakdown.budget).toBe(7.5);
  });

  it("gives half proximity credit when the viewer has no location", () => {
    expect(scoreEvent({ ...viewer, coarseLat: null, coarseLng: null }, pottery).breakdown.proximity).toBe(5);
  });

  it("rewards friends going on top of group-size fit, capped at the social weight", () => {
    expect(scoreEvent(viewer, { ...pottery, friendsGoing: 2 }).breakdown.social).toBe(10);
    const big = { ...pottery, capacity: 40, friendsGoing: 1 };
    expect(scoreEvent(viewer, big).breakdown.social).toBe(3);
  });

  it("gives adjacent group sizes partial credit", () => {
    expect(scoreEvent(viewer, { ...pottery, capacity: 10 }).breakdown.social).toBe(3.5);
  });

  it("derives categories from tags when 02 does not send interestCategories", () => {
    const { interestCategories: _omit, ...legacy } = viewer;
    expect(scoreEvent(legacy, pottery).breakdown.interest).toBe(40);
  });
});

describe("rankEvents", () => {
  const games: CandidateEvent = {
    ...pottery,
    id: "games",
    title: "Board Game Social",
    description: "Meet people over Catan.",
    category: "games",
    startsAt: "2026-10-28T02:00:00Z", // Tue 19:00 PT
    capacity: 20,
    priceCents: 1000,
  };
  const far: CandidateEvent = { ...pottery, id: "far", venue: { lat: 37.87, lng: -122.27 } }; // Berkeley

  it("orders by score, drops events outside the travel radius", () => {
    const ranked = rankEvents(viewer, [games, far, pottery]);
    expect(ranked.map((r) => r.event.id)).toEqual(["pottery", "games"]);
  });

  it("deprioritizes events the viewer cancelled without hiding them", () => {
    const cancelled = { ...pottery, cancelledByViewer: true };
    const ranked = rankEvents(viewer, [cancelled, games]);
    expect(ranked.map((r) => r.event.id)).toEqual(["games", "pottery"]);
    expect(ranked[1]!.deprioritized).toBe(true);
  });

  it("falls back to distance then date when the viewer has not consented", () => {
    const later = { ...pottery, id: "later", startsAt: "2026-11-05T02:00:00Z" };
    const nearer = { ...games, id: "nearer", venue: { lat: 37.76, lng: -122.42 } };
    const ranked = rankEvents(null, [later, pottery, nearer], { lat: 37.76, lng: -122.42 });
    expect(ranked.map((r) => r.event.id)).toEqual(["nearer", "pottery", "later"]);
    expect(ranked[0]!.score).toBeNull();
  });

  it("orders by date alone when neither preferences nor location are known", () => {
    const ranked = rankEvents(null, [pottery, games]);
    expect(ranked.map((r) => r.event.id)).toEqual(["games", "pottery"]);
  });

  it("breaks score ties by start time then id", () => {
    const twin = { ...pottery, id: "a-twin" };
    expect(rankEvents(viewer, [pottery, twin]).map((r) => r.event.id)).toEqual(["a-twin", "pottery"]);
  });

  it("does not mutate its input", () => {
    const input = Object.freeze([games, pottery]);
    rankEvents(viewer, input);
    expect(input.map((e) => e.id)).toEqual(["games", "pottery"]);
  });
});

describe("helpers", () => {
  it("buckets capacity like GROUP_SIZE_PREF", () => {
    expect([2, 3, 6, 7, 12, 13].map(capacityBucket)).toEqual([
      "one_on_one", "small", "small", "medium", "medium", "large",
    ]);
  });

  it("computes haversine distance in km", () => {
    expect(haversineKm({ lat: 37.76, lng: -122.42 }, { lat: 37.87, lng: -122.27 })).toBeCloseTo(17.9, 0);
    expect(haversineKm(VENUE, VENUE)).toBe(0);
  });

  it("maps interest tags to categories, ignoring unknown tags", () => {
    expect(categoriesForInterests(["Pottery", "board-games", "tarot"])).toEqual(["creative", "games"]);
  });
});
