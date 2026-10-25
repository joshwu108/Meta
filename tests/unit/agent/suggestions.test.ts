import { describe, expect, it, vi } from "vitest";

const warn = vi.fn();
vi.mock("@/lib/log", () => ({ log: { warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/features/agent/server/suggestions/people", () => ({ suggestPeople: async () => { throw new Error("db down"); } }));
vi.mock("@/features/agent/server/suggestions/groups", () => ({ suggestGroups: async () => [{ id: "g1", name: "G", description: "", memberCount: 3 }] }));
vi.mock("@/features/agent/server/suggestions/events", () => ({ suggestEvents: async () => { throw new Error("06 unavailable"); } }));

const { suggestEvents, suggestGroups, suggestPeople } = await import("@/features/agent/server/suggestions");

describe("agent suggestion sources", () => {
  it("a failing source yields no cards and is logged, without affecting the others", async () => {
    const viewer = { userId: "u", interests: [], availabilitySlots: [] };
    expect(await suggestPeople(viewer)).toEqual([]);
    expect(await suggestEvents("u")).toEqual([]);
    expect(await suggestGroups(viewer)).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith("agent.suggestions_failed", expect.objectContaining({ source: "people" }));
    expect(warn).toHaveBeenCalledWith("agent.suggestions_failed", expect.objectContaining({ source: "events" }));
  });
});
