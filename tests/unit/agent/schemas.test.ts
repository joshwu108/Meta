import { describe, expect, it } from "vitest";
import {
  ConsentSchema,
  DEFAULT_CONSENT,
  ExtractedPreferencesSchema,
  UserPreferencesPatchSchema,
} from "@/features/agent/schemas";
import { parseConsent, patchToColumns, rowToPreferences, type PreferencesRow } from "@/features/agent/server/rows";

const extracted = {
  interests: [{ tag: "pottery", confidence: 0.9 }],
  interestCategories: ["creative"],
  availabilitySlots: ["thu_eve"],
  socialGoals: ["make_friends"],
  groupSizePref: "small",
  budgetMaxCents: null,
  activityPrefs: [],
  dealbreakers: [],
  summary: "Likes pottery.",
  followUpQuestion: null,
  missingFields: [],
};

describe("Zod enum validation", () => {
  it("accepts a valid extraction", () => {
    expect(ExtractedPreferencesSchema.safeParse(extracted).success).toBe(true);
  });

  it.each([
    ["availabilitySlots", ["thursday_evening"]],
    ["interestCategories", ["pottery"]],
    ["socialGoals", ["find_love"]],
    ["groupSizePref", "huge"],
  ])("rejects unknown %s values", (field, value) => {
    expect(ExtractedPreferencesSchema.safeParse({ ...extracted, [field]: value }).success).toBe(false);
  });

  it("rejects unknown keys and inverted budgets in a patch", () => {
    expect(UserPreferencesPatchSchema.safeParse({ favoriteColor: "blue" }).success).toBe(false);
    expect(UserPreferencesPatchSchema.safeParse({ budgetMinCents: 3000, budgetMaxCents: 1000 }).success).toBe(false);
  });

  it("normalizes tags to lowercase kebab", () => {
    expect(UserPreferencesPatchSchema.parse({ interests: ["Board Games", " Coffee "] }).interests).toEqual([
      "board-games",
      "coffee",
    ]);
  });

  it("rejects consent with unknown flags", () => {
    expect(ConsentSchema.safeParse({ ...DEFAULT_CONSENT, sell_my_data: true }).success).toBe(false);
  });
});

describe("row mapping", () => {
  const row: PreferencesRow = {
    user_id: "u1",
    interests: ["pottery"],
    interest_categories: ["creative", "not-a-category"],
    availability_slots: ["thu_eve", "someday"],
    social_goals: [],
    group_size_pref: "small",
    budget_min_cents: null,
    budget_max_cents: 2500,
    travel_radius_km: "5.0",
    activity_prefs: [],
    dealbreakers: [],
    field_sources: { interests: "ai_inferred" },
  };

  it("returns empty preferences for a missing row", () => {
    expect(rowToPreferences(null).interests).toEqual([]);
  });

  it("drops invalid enum values instead of trusting them", () => {
    const prefs = rowToPreferences(row);
    expect(prefs.interestCategories).toEqual(["creative"]);
    expect(prefs.availabilitySlots).toEqual(["thu_eve"]);
    expect(prefs.travelRadiusKm).toBe(5);
    expect(prefs.fieldSources).toEqual({ interests: "ai_inferred" });
  });

  it("maps a patch to snake_case columns", () => {
    expect(patchToColumns({ availabilitySlots: ["thu_eve"], budgetMaxCents: null })).toEqual({
      availability_slots: ["thu_eve"],
      budget_max_cents: null,
    });
  });

  it("fills missing consent flags with defaults", () => {
    expect(parseConsent({ allow_matching: true })).toEqual({ ...DEFAULT_CONSENT, allow_matching: true });
    expect(parseConsent("garbage")).toEqual(DEFAULT_CONSENT);
  });
});
