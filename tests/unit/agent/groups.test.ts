import { describe, expect, it, vi } from "vitest";

const { suggestGroupsFrom } = await import("@/features/agent/server/suggestions/groups");

const group = (id: string, interests: string[], memberCount: number, description: string | null = "d") => ({ id, name: id, description, interests, memberCount });
const viewer = { userId: "me", interests: ["pottery", "coffee"] };

describe("suggestGroupsFrom", () => {
  it("ranks by shared interests then size and skips groups the viewer is in", async () => {
    const deps = {
      publicGroups: vi.fn(async () => [group("big", [], 20), group("pots", ["pottery"], 3), group("both", ["pottery", "coffee"], 2), group("mine", ["pottery", "coffee"], 9)]),
      memberIds: vi.fn(async (id: string) => (id === "mine" ? ["me", "x"] : ["x"])),
    };
    const out = await suggestGroupsFrom(deps, viewer);
    expect(out.map((g) => g.id)).toEqual(["both", "pots", "big"]);
    expect(deps.publicGroups).toHaveBeenCalledWith(12);
  });

  it("maps a missing description to an empty string and honors the limit", async () => {
    const deps = { publicGroups: async () => [group("a", ["pottery"], 1, null), group("b", [], 5)], memberIds: async () => [] };
    expect(await suggestGroupsFrom(deps, viewer, 1)).toEqual([{ id: "a", name: "a", description: "", memberCount: 1 }]);
  });

  it("returns nothing when there are no public groups", async () => {
    expect(await suggestGroupsFrom({ publicGroups: async () => [], memberIds: async () => [] }, viewer)).toEqual([]);
  });
});
