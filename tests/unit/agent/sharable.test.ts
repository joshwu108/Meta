import { describe, expect, it, vi } from "vitest";
import {
  shareBatch,
  toSharable,
  type SharableSource,
  type SharingDeps,
} from "@/features/agent/server/sharable";
import { DEFAULT_CONSENT, EMPTY_PREFERENCES, type SharingPurpose } from "@/features/agent/schemas";

function source(overrides: Partial<SharableSource> = {}): SharableSource {
  return {
    userId: "u1",
    preferences: {
      ...EMPTY_PREFERENCES,
      interests: ["pottery", "coffee"],
      availabilitySlots: ["thu_eve"],
      groupSizePref: "small",
      dealbreakers: ["no-alcohol"],
      budgetMaxCents: 2500,
    },
    consent: {
      ...DEFAULT_CONSENT,
      allow_matching: true,
      allow_demand_aggregation: true,
      allow_group_planning: true,
    },
    isDiscoverable: true,
    neighborhood: "Mission",
    coarseLat: 37.76,
    coarseLng: -122.42,
    ...overrides,
  };
}

describe("toSharable", () => {
  it.each<[SharingPurpose, keyof SharableSource["consent"]]>([
    ["matching", "allow_matching"],
    ["demand", "allow_demand_aggregation"],
    ["group_plan", "allow_group_planning"],
  ])("returns null for %s when %s is false", (purpose, flag) => {
    const src = source();
    expect(toSharable(src, purpose)).not.toBeNull();
    expect(toSharable({ ...src, consent: { ...src.consent, [flag]: false } }, purpose)).toBeNull();
  });

  it("returns null for matching when the user is not discoverable", () => {
    expect(toSharable(source({ isDiscoverable: false }), "matching")).toBeNull();
    expect(toSharable(source({ isDiscoverable: false }), "demand")).not.toBeNull();
  });

  it("never includes dealbreakers, field sources, or summary text", () => {
    const shared = toSharable(source(), "matching");
    const json = JSON.stringify(shared);
    expect(shared).not.toHaveProperty("dealbreakers");
    expect(shared).not.toHaveProperty("fieldSources");
    expect(shared).not.toHaveProperty("summary");
    expect(json).not.toContain("no-alcohol");
  });

  it("maps fields to the SharablePreferences contract", () => {
    expect(toSharable(source(), "demand")).toEqual({
      userId: "u1",
      interests: ["pottery", "coffee"],
      availabilitySlots: ["thu_eve"],
      socialGoals: [],
      groupSizePref: "small",
      budgetMin: null,
      budgetMax: 2500,
      travelRadiusKm: 5,
      activityPrefs: [],
      coarseLat: 37.76,
      coarseLng: -122.42,
      neighborhood: "Mission",
    });
  });

  it("does not share array references with the source", () => {
    const src = source();
    const shared = toSharable(src, "matching");
    expect(shared?.interests).not.toBe(src.preferences.interests);
  });
});

describe("shareBatch", () => {
  function deps(sources: SharableSource[], recent: string[] = []): SharingDeps & {
    writeLogs: ReturnType<typeof vi.fn>;
  } {
    return {
      loadSources: vi.fn(async (ids) => sources.filter((s) => ids.includes(s.userId))),
      recentlyLogged: vi.fn(async () => new Set(recent)),
      writeLogs: vi.fn(async () => undefined),
    };
  }

  it("returns only consenting users and logs them in one call", async () => {
    const d = deps([
      source({ userId: "a" }),
      source({ userId: "b", consent: { ...DEFAULT_CONSENT } }),
      source({ userId: "c" }),
    ]);
    const result = await shareBatch(d, ["a", "b", "c", "a"], "matching");
    expect([...result.keys()]).toEqual(["a", "c"]);
    expect(d.writeLogs).toHaveBeenCalledTimes(1);
    expect(d.writeLogs).toHaveBeenCalledWith(["a", "c"], "matching");
  });

  it("skips users already logged inside the window", async () => {
    const d = deps([source({ userId: "a" }), source({ userId: "c" })], ["a"]);
    await shareBatch(d, ["a", "c"], "demand");
    expect(d.writeLogs).toHaveBeenCalledWith(["c"], "demand");
  });

  it("writes no log when nobody is shared", async () => {
    const d = deps([source({ userId: "b", consent: { ...DEFAULT_CONSENT } })]);
    const result = await shareBatch(d, ["b"], "demand");
    expect(result.size).toBe(0);
    expect(d.writeLogs).not.toHaveBeenCalled();
  });

  it("handles an empty request without touching the database", async () => {
    const d = deps([]);
    expect((await shareBatch(d, [], "matching")).size).toBe(0);
    expect(d.loadSources).not.toHaveBeenCalled();
  });
});
