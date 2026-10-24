import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SharablePreferences } from "@/shared/types";

const logAgentAction = vi.fn();
vi.mock("@/features/events/server/stubs/core", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  logAgentAction: (...args: unknown[]) => logAgentAction(...args),
}));

const { explainRecommendation, suggestFollowUp } = await import("@/features/events/server/stubs/agent");

const viewer = { userId: "v" } as SharablePreferences;
const event = { title: "Pottery Night", category: "creative", slot: "Thursday evening", capacity: 6, priceCents: 2500 };

describe("explainRecommendation stub (02's ExplainInput)", () => {
  it("cites only factors that scored", async () => {
    const text = await explainRecommendation({
      viewer, target: { kind: "event", event }, breakdown: { interest: 40, slot: 25, budget: 15, proximity: 9, social: 7 },
    });
    expect(text).toBe("Pottery Night fits your interests on a Thursday evening, small group, within your budget, close to you.");
  });

  it("falls back to the title and says free for free events", async () => {
    const text = await explainRecommendation({
      viewer, target: { kind: "event", event: { ...event, priceCents: null, capacity: 12, slot: null } },
      breakdown: { interest: 0, slot: 0, budget: 15, proximity: 2, social: 10 },
    });
    expect(text).toBe("Pottery Night, right-sized group, free.");
  });

  it("gives a generic line for non-event targets", async () => {
    const text = await explainRecommendation({ viewer, target: { kind: "group", group: {} }, breakdown: {} });
    expect(text).toBe("Matches your preferences and availability.");
  });
});

describe("suggestFollowUp stub (02's signature)", () => {
  const prefs = (userId: string, slots: string[]) => ({ userId, availabilitySlots: slots }) as SharablePreferences;
  const completed = { title: "Latte Art", category: "food_drink" as const, startsAt: "2026-10-21T01:00:00Z" };
  beforeEach(() => logAgentAction.mockReset());

  it("prefers a shared daytime slot and logs one agent action per person", async () => {
    const out = await suggestFollowUp({ a: prefs("a", ["thu_eve", "sat_day"]), b: prefs("b", ["sat_day", "thu_eve"]), event: completed });

    expect(out).toMatchObject({ suggestedSlot: "sat_day", title: "Coffee, Saturday morning", suggestedBusinessCategory: "food_drink" });
    expect(out.description).toContain("Latte Art");
    expect(logAgentAction.mock.calls.map(([input]) => input.userId)).toEqual(["a", "b"]);
    expect(logAgentAction.mock.calls[0]![0]).toMatchObject({ actor: "personal_agent", action: "follow_up_suggestion" });
  });

  it("uses any shared slot, then Saturday morning when nothing is shared", async () => {
    expect((await suggestFollowUp({ a: prefs("a", ["thu_eve"]), b: prefs("b", ["thu_eve"]), event: completed })).suggestedSlot).toBe("thu_eve");
    expect((await suggestFollowUp({ a: prefs("a", ["mon_eve"]), b: prefs("b", ["thu_eve"]), event: completed })).suggestedSlot).toBe("sat_day");
  });
});
