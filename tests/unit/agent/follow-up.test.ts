import { describe, expect, it, vi } from "vitest";
import type { SharablePreferences } from "@/shared/types";

const logs: Record<string, unknown>[] = [];
vi.mock("@/features/core", () => ({
  logAgentAction: async (input: Record<string, unknown>) => {
    logs.push(input);
  },
}));
vi.mock("@/lib/ai", async () => (await import("./mock-ai")).mockAi);
const { suggestFollowUp } = await import("@/features/agent/server/follow-up");

const p = (userId: string, slots: SharablePreferences["availabilitySlots"]): SharablePreferences => ({
  userId, interests: ["pottery", "coffee"], interestCategories: ["creative", "food_drink"], availabilitySlots: slots, socialGoals: [], groupSizePref: "small",
  budgetMin: null, budgetMax: null, travelRadiusKm: 5, activityPrefs: [], coarseLat: null, coarseLng: null, neighborhood: null,
});
const event = { title: "Beginner Pottery & Coffee Night", category: "creative" as const, startsAt: "2026-10-29T19:00:00-07:00" };

describe("suggestFollowUp (MOCK_AI)", () => {
  it("returns the suggestion and logs it for both users", async () => {
    const out = await suggestFollowUp({ a: p("a", ["thu_eve"]), b: p("b", ["thu_eve", "sat_day"]), event });
    expect(out).toMatchObject({ title: expect.any(String), suggestedSlot: "thu_eve" });
    expect(logs.map((l) => l.userId)).toEqual(["a", "b"]);
  });

  it("forces the slot onto one both users share", async () => {
    const out = await suggestFollowUp({ a: p("a", ["sun_day"]), b: p("b", ["sun_day"]), event });
    expect(out.suggestedSlot).toBe("sun_day");
  });

  it("with no shared slot, picks one at least one of them is free rather than neither", async () => {
    // The fixture suggests thu_eve, which neither user is free for.
    const out = await suggestFollowUp({ a: p("a", ["mon_eve"]), b: p("b", ["sat_day"]), event });
    expect(["mon_eve", "sat_day"]).toContain(out.suggestedSlot);
  });

  it("keeps the model's slot when one of them is free then and they share none", async () => {
    const out = await suggestFollowUp({ a: p("a", ["thu_eve"]), b: p("b", ["sat_day"]), event });
    expect(out.suggestedSlot).toBe("thu_eve");
  });

  it("keeps the venue category inside what both people are into", async () => {
    // The fixture proposes food_drink; these two only share outdoors.
    const outdoorsy = (id: string): SharablePreferences => ({ ...p(id, ["sat_day"]), interestCategories: ["outdoors", id === "a" ? "music" : "fitness"] });
    const out = await suggestFollowUp({ a: outdoorsy("a"), b: outdoorsy("b"), event });
    expect(out.suggestedBusinessCategory).toBe("outdoors");
  });

  it("keeps the model's category when it is shared, or when they share none", async () => {
    expect((await suggestFollowUp({ a: p("a", ["thu_eve"]), b: p("b", ["thu_eve"]), event })).suggestedBusinessCategory).toBe("food_drink");
    const none = (id: string, c: "music" | "fitness"): SharablePreferences => ({ ...p(id, ["thu_eve"]), interestCategories: [c] });
    expect((await suggestFollowUp({ a: none("a", "music"), b: none("b", "fitness"), event })).suggestedBusinessCategory).toBe("food_drink");
  });

  it("refuses to pair a user with themselves", async () => {
    await expect(suggestFollowUp({ a: p("a", ["thu_eve"]), b: p("a", ["thu_eve"]), event })).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
