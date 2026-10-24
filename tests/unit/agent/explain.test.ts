import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SharablePreferences } from "@/shared/types";

let aiImpl: (opts: unknown) => Promise<unknown> = async () => undefined;
const aiCalls: unknown[] = [];
vi.mock("@/features/agent/server/stubs", () => ({
  generateStructured: (o: unknown) => {
    aiCalls.push(o);
    return aiImpl(o);
  },
}));

const { groundHighlights, explainDetailed, explainRecommendation, fallbackExplanation } = await import(
  "@/features/agent/server/explain"
);

const prefs = (interests: string[]): SharablePreferences => ({
  userId: "u",
  interests,
  availabilitySlots: ["thu_eve"],
  socialGoals: ["make_friends"],
  groupSizePref: "small",
  budgetMin: null,
  budgetMax: null,
  travelRadiusKm: 5,
  activityPrefs: [],
  coarseLat: 37.76,
  coarseLng: -122.42,
  neighborhood: "Mission",
});

const input = {
  viewer: prefs(["pottery", "coffee"]),
  target: { kind: "person" as const, preferences: prefs(["pottery", "hiking"]) },
  breakdown: { interests: 0.5 },
};

describe("groundHighlights", () => {
  it("keeps highlights that appear in the input and drops invented ones", () => {
    expect(groundHighlights(["pottery", "jazz", "Thursday evenings", "thu_eve"], input)).toEqual([
      "pottery",
      "thu_eve",
    ]);
  });

  it("matches case- and punctuation-insensitively", () => {
    expect(groundHighlights(["Pottery!", "  mission "], input)).toEqual(["Pottery!", "mission"]);
  });

  it("drops empty strings and caps at three", () => {
    expect(groundHighlights(["", "   ", "pottery", "coffee", "hiking", "mission"], input)).toHaveLength(3);
  });
});

describe("explainDetailed", () => {
  beforeEach(() => {
    aiCalls.length = 0;
  });

  it("post-checks model highlights against the input", async () => {
    aiImpl = async () => ({
      explanation: "You both love pottery.",
      highlights: ["pottery", "free on Mondays"],
    });
    expect(await explainDetailed(input)).toEqual({
      explanation: "You both love pottery.",
      highlights: ["pottery"],
    });
    expect(aiCalls[0]).toMatchObject({
      prompt: "agent.explain_recommendation",
      model: "fast",
    });
  });

  it("falls back to a deterministic explanation when the AI fails", async () => {
    aiImpl = async () => {
      throw new Error("down");
    };
    expect(await explainRecommendation(input)).toBe("You both like pottery.");
  });
});

describe("fallbackExplanation", () => {
  it("cites interests found in an event", () => {
    const out = fallbackExplanation({
      viewer: prefs(["pottery", "coffee"]),
      target: { kind: "event", event: { title: "Beginner Pottery & Coffee Night" } },
      breakdown: {},
    });
    expect(out.highlights).toEqual(["pottery", "coffee"]);
  });

  it("has a neutral line when nothing is shared", () => {
    const out = fallbackExplanation({
      viewer: prefs(["chess"]),
      target: { kind: "group", group: { name: "Hikers" } },
      breakdown: {},
    });
    expect(out).toEqual({ explanation: "Matches your preferences and availability.", highlights: [] });
  });
});
