import { describe, expect, it, vi } from "vitest";
import type { SharablePreferences } from "@/shared/types";

const logs: Record<string, unknown>[] = [];
vi.mock("@/features/agent/server/stubs", async (orig) => ({
  ...(await orig<typeof import("@/features/agent/server/stubs")>()),
  logAgentAction: async (input: Record<string, unknown>) => {
    logs.push(input);
  },
}));
const { suggestFollowUp } = await import("@/features/agent/server/follow-up");

const p = (userId: string, slots: SharablePreferences["availabilitySlots"]): SharablePreferences => ({
  userId, interests: ["pottery", "coffee"], availabilitySlots: slots, socialGoals: [], groupSizePref: "small",
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
});
