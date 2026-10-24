import { describe, expect, it } from "vitest";
import { explainRecommendation, suggestFollowUp } from "@/features/events/server/stubs/agent";
import type { SharablePreferences } from "@/shared/types";

const viewer = { userId: "v" } as SharablePreferences;
const target = { kind: "event" as const, title: "Pottery Night", category: "creative" as const, slotLabel: "Thursday evening", capacity: 6, priceCents: 2500 };

describe("explainRecommendation stub", () => {
  it("cites only factors that scored", async () => {
    const text = await explainRecommendation({ viewer, target, breakdown: { interest: 40, slot: 25, budget: 15, proximity: 9, social: 7 } });
    expect(text).toBe("Pottery Night fits your interests on a Thursday evening, small group, within your budget, close to you.");
  });

  it("falls back to the title and says free for free events", async () => {
    const text = await explainRecommendation({
      viewer, target: { ...target, priceCents: null, capacity: 12, slotLabel: null },
      breakdown: { interest: 0, slot: 0, budget: 15, proximity: 2, social: 10 },
    });
    expect(text).toBe("Pottery Night, right-sized group, free.");
  });
});

describe("suggestFollowUp stub", () => {
  const prefs = (slots: string[]) => ({ availabilitySlots: slots }) as SharablePreferences;
  const event = { title: "Latte Art", category: "food_drink" as const, neighborhood: "Hayes Valley" };

  it("prefers a shared daytime slot", async () => {
    const out = await suggestFollowUp({ a: prefs(["thu_eve", "sat_day"]), b: prefs(["sat_day", "thu_eve"]), event });
    expect(out).toMatchObject({ suggestedSlot: "sat_day", title: "Coffee, Saturday morning", suggestedBusinessCategory: "food_drink" });
  });

  it("uses any shared slot, then Saturday morning when nothing is shared or consented", async () => {
    expect((await suggestFollowUp({ a: prefs(["thu_eve"]), b: prefs(["thu_eve"]), event })).suggestedSlot).toBe("thu_eve");
    expect((await suggestFollowUp({ a: null, b: prefs(["thu_eve"]), event })).suggestedSlot).toBe("sat_day");
  });

  it("mentions the venue neighborhood, or the venue when unknown", async () => {
    expect((await suggestFollowUp({ a: null, b: null, event })).description).toContain("near Hayes Valley");
    expect((await suggestFollowUp({ a: null, b: null, event: { ...event, neighborhood: "" } })).description).toContain("near the venue");
  });
});
