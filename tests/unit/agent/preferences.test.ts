import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeRepo } from "./fake-repo";

const fake = createFakeRepo();
const logs: Record<string, unknown>[] = [];
vi.mock("@/features/agent/server/repo", () => fake.repo);
vi.mock("@/features/agent/server/stubs", async (orig) => ({
  ...(await orig<typeof import("@/features/agent/server/stubs")>()),
  logAgentAction: async (input: Record<string, unknown>) => {
    logs.push(input);
  },
}));

const { applyPatch, patchPreferences, patchPermissions, getPermissions } = await import(
  "@/features/agent/server/preferences"
);
const { EMPTY_PREFERENCES, DEFAULT_CONSENT } = await import("@/features/agent/schemas");

const SB = {} as never;
const inferred = {
  ...EMPTY_PREFERENCES,
  interests: ["pottery", "coffee"],
  fieldSources: { interests: "ai_inferred" as const, groupSizePref: "ai_inferred" as const },
};

beforeEach(() => {
  fake.state.prefs.clear();
  fake.state.agent.clear();
  logs.length = 0;
});

describe("applyPatch", () => {
  it("deleting an inferred value removes it and marks the field user_set", () => {
    const out = applyPatch(inferred, { interests: ["pottery"] });
    expect(out.interests).toEqual(["pottery"]);
    expect(out.fieldSources).toEqual({ interests: "user_set", groupSizePref: "ai_inferred" });
  });

  it("rejects a min budget above the stored max", () => {
    expect(() => applyPatch({ ...inferred, budgetMaxCents: 1000 }, { budgetMinCents: 2000 })).toThrow(/budget/i);
  });

  it("does not mutate the current preferences", () => {
    const snapshot = JSON.stringify(inferred);
    applyPatch(inferred, { interests: [] });
    expect(JSON.stringify(inferred)).toBe(snapshot);
  });
});

describe("patchPreferences", () => {
  it("persists a deletion (AC2)", async () => {
    fake.state.prefs.set("u1", inferred);
    await patchPreferences(SB, "u1", { interests: ["coffee"] });
    expect(fake.state.prefs.get("u1")).toMatchObject({ interests: ["coffee"], fieldSources: { interests: "user_set" } });
  });
});

describe("permissions", () => {
  it("defaults to everything off", async () => {
    expect(await getPermissions(SB, "u1")).toEqual(DEFAULT_CONSENT);
  });

  it("merges a partial patch and logs only real changes", async () => {
    const out = await patchPermissions(SB, "u1", { allow_matching: true, allow_group_planning: false });
    expect(out).toEqual({ ...DEFAULT_CONSENT, allow_matching: true });
    expect(logs).toEqual([expect.objectContaining({ action: "update_permissions", permissionsUsed: ["allow_matching"] })]);
  });

  it("writes no log when nothing changed", async () => {
    await patchPermissions(SB, "u1", { allow_matching: false });
    expect(logs).toHaveLength(0);
  });
});
