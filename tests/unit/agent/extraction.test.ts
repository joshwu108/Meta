import { describe, expect, it } from "vitest";
import {
  groundExtraction,
  mergeExtraction,
  nextOnboardingStep,
  recap,
} from "@/features/agent/server/extraction";
import { EMPTY_PREFERENCES, type ExtractedPreferences } from "@/features/agent/schemas";

const SCENE_1 =
  "I just moved here, I like pottery and coffee shops, free Thursday evenings, small groups.";

function extraction(overrides: Partial<ExtractedPreferences> = {}): ExtractedPreferences {
  return {
    interests: [
      { tag: "pottery", confidence: 0.95 },
      { tag: "coffee", confidence: 0.85 },
    ],
    interestCategories: ["creative", "food_drink"],
    availabilitySlots: ["thu_eve"],
    socialGoals: ["make_friends", "explore_city"],
    groupSizePref: "small",
    budgetMaxCents: null,
    activityPrefs: [],
    dealbreakers: [],
    summary: "New in town; loves pottery and coffee; free Thursday evenings; prefers small groups.",
    followUpQuestion: null,
    missingFields: ["budget"],
    ...overrides,
  };
}

const empty = { ...EMPTY_PREFERENCES, fieldSources: {} };

describe("groundExtraction", () => {
  it("drops slots for days the user never mentioned", () => {
    const out = groundExtraction(extraction({ availabilitySlots: ["thu_eve", "sat_day"] }), SCENE_1);
    expect(out.availabilitySlots).toEqual(["thu_eve"]);
  });

  it("drops an invented budget", () => {
    expect(groundExtraction(extraction({ budgetMaxCents: 2000 }), SCENE_1).budgetMaxCents).toBeNull();
    expect(groundExtraction(extraction({ budgetMaxCents: 2000 }), "under $20 please").budgetMaxCents).toBe(2000);
  });

  it("adds slots the phrase mapper finds even if the model missed them", () => {
    expect(groundExtraction(extraction({ availabilitySlots: [] }), SCENE_1).availabilitySlots).toEqual(["thu_eve"]);
  });

  it("drops low-confidence interests", () => {
    const out = groundExtraction(
      extraction({ interests: [{ tag: "pottery", confidence: 0.9 }, { tag: "jazz", confidence: 0.2 }] }),
      SCENE_1,
    );
    expect(out.interests.map((i) => i.tag)).toEqual(["pottery"]);
  });
});

describe("mergeExtraction", () => {
  it("writes Scene 1 fields as ai_inferred with nothing invented", () => {
    const out = mergeExtraction(empty, groundExtraction(extraction(), SCENE_1));
    expect(out.interests).toEqual(["pottery", "coffee"]);
    expect(out.availabilitySlots).toEqual(["thu_eve"]);
    expect(out.groupSizePref).toBe("small");
    expect(out.budgetMaxCents).toBeNull();
    expect(out.fieldSources).toEqual({
      interests: "ai_inferred",
      interestCategories: "ai_inferred",
      availabilitySlots: "ai_inferred",
      socialGoals: "ai_inferred",
      groupSizePref: "ai_inferred",
    });
  });

  it("does not overwrite scalars the user already set", () => {
    const current = { ...empty, groupSizePref: "medium" as const, fieldSources: { groupSizePref: "user_set" as const } };
    const out = mergeExtraction(current, extraction());
    expect(out.groupSizePref).toBe("medium");
    expect(out.fieldSources.groupSizePref).toBe("user_set");
  });

  it("unions arrays and normalizes tags", () => {
    const current = { ...empty, interests: ["hiking"], fieldSources: { interests: "user_set" as const } };
    const out = mergeExtraction(
      current,
      extraction({ interests: [{ tag: "Board Games", confidence: 0.9 }, { tag: "hiking", confidence: 0.9 }] }),
    );
    expect(out.interests).toEqual(["hiking", "board-games"]);
    expect(out.fieldSources.interests).toBe("user_set");
  });

  it("does not mutate the input", () => {
    const current = { ...empty, interests: ["hiking"], fieldSources: {} };
    const snapshot = JSON.stringify(current);
    mergeExtraction(current, extraction());
    expect(JSON.stringify(current)).toBe(snapshot);
  });
});

describe("nextOnboardingStep", () => {
  const q = extraction({ followUpQuestion: "Any budget in mind?" });

  it("asks the follow-up when allowed", () => {
    expect(nextOnboardingStep(q, 1, 0)).toEqual({ done: false, question: "Any budget in mind?" });
  });

  it("moves to review with no question, after 3 follow-ups, or at turn 4", () => {
    expect(nextOnboardingStep(extraction(), 1, 0)).toEqual({ done: true });
    expect(nextOnboardingStep(q, 3, 3)).toEqual({ done: true });
    expect(nextOnboardingStep(q, 4, 1)).toEqual({ done: true });
  });
});

describe("recap", () => {
  it("summarizes what was heard", () => {
    const prefs = mergeExtraction(empty, extraction());
    expect(recap(prefs)).toBe("Here's what I heard: pottery, coffee, Thursday evenings, small groups.");
  });

  it("prompts for more when nothing is known", () => {
    expect(recap(EMPTY_PREFERENCES)).toMatch(/tell me/i);
  });
});
