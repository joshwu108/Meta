import { describe, expect, it } from "vitest";
import { resolveGroupSchedule } from "@/features/agent/server/group-schedule";
import type { SharablePreferences } from "@/shared/types";

const m = (userId: string, slots: SharablePreferences["availabilitySlots"], budgetMax: number | null = null): SharablePreferences => ({
  userId, interests: [], availabilitySlots: slots, socialGoals: [], groupSizePref: "small", budgetMin: null, budgetMax,
  travelRadiusKm: 5, activityPrefs: [], coarseLat: null, coarseLng: null, neighborhood: null,
});

describe("resolveGroupSchedule", () => {
  it("finds the slot everyone shares", () => {
    const out = resolveGroupSchedule([m("a", ["thu_eve", "sat_day"]), m("b", ["thu_eve"]), m("c", ["thu_eve", "fri_eve"])]);
    expect(out.unanimous).toBe("thu_eve");
    expect(out.options[0]).toEqual({ slot: "thu_eve", available: ["a", "b", "c"], missing: [] });
  });

  it("ranks partial options and names who is missing when there is a conflict", () => {
    const out = resolveGroupSchedule([m("a", ["thu_eve"]), m("b", ["fri_eve", "thu_eve"]), m("c", ["fri_eve"])]);
    expect(out.unanimous).toBeNull();
    expect(out.options.map((o) => o.slot)).toEqual(["thu_eve", "fri_eve"]);
    expect(out.options[0].missing).toEqual(["c"]);
  });

  it("uses the lowest stated budget and ignores members without one", () => {
    expect(resolveGroupSchedule([m("a", [], 2500), m("b", [], 1500), m("c", [])]).budgetMaxCents).toBe(1500);
    expect(resolveGroupSchedule([m("a", [])]).budgetMaxCents).toBeNull();
  });

  it("handles an empty group and caps options", () => {
    expect(resolveGroupSchedule([])).toEqual({ options: [], unanimous: null, budgetMaxCents: null });
    const all = resolveGroupSchedule([m("a", ["mon_eve", "tue_eve", "wed_eve", "thu_eve"])], 2);
    expect(all.options).toHaveLength(2);
  });
});
