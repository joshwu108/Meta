import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { suggestEventsFrom, suggestGroupsFrom, toEventCandidate } = await import(
  "@/features/agent/server/suggestions"
);

type Rec = Parameters<typeof toEventCandidate>[0];

function rec(id: string, title: string, explanation = "because pottery"): Rec {
  return {
    event: {
      id,
      title,
      startsAt: "2026-11-05T19:00:00-08:00",
      description: "Throw a bowl.",
      category: "creative",
      business: { name: "Kiln & Cup" },
    },
    explanation,
  } as Rec;
}

const group = (id: string, name: string, interests: string[], memberCount: number) => ({
  id,
  name,
  description: `${name} desc`,
  interests,
  memberCount,
});

const viewer = { interests: ["pottery", "coffee"] };

describe("toEventCandidate", () => {
  it("flattens a ranked event onto the agent's card shape, venue from the business", () => {
    expect(toEventCandidate(rec("e1", "Pottery Night"))).toEqual({
      id: "e1",
      title: "Pottery Night",
      startsAt: "2026-11-05T19:00:00-08:00",
      venue: "Kiln & Cup",
      category: "creative",
      description: "Throw a bowl.",
      explanation: "because pottery",
    });
  });
});

describe("suggestEventsFrom", () => {
  it("asks the recommender for live events and respects the limit", async () => {
    const recommendedEvents = vi.fn().mockResolvedValue([rec("e1", "A"), rec("e2", "B"), rec("e3", "C")]);
    const out = await suggestEventsFrom({ recommendedEvents }, "u1", 2);
    expect(recommendedEvents).toHaveBeenCalledWith("u1", 2);
    expect(out.map((e) => e.id)).toEqual(["e1", "e2"]);
  });

  it("carries the recommender's explanation through so no second model call is needed", async () => {
    const recommendedEvents = vi.fn().mockResolvedValue([rec("e1", "A", "Thursday pottery near you")]);
    const [first] = await suggestEventsFrom({ recommendedEvents }, "u1", 3);
    expect(first!.explanation).toBe("Thursday pottery near you");
  });

  it("returns nothing when there are no live events, rather than inventing one", async () => {
    const out = await suggestEventsFrom({ recommendedEvents: async () => [] }, "u1", 3);
    expect(out).toEqual([]);
  });
});

describe("suggestGroupsFrom", () => {
  it("ranks by shared interests first, then by size", async () => {
    const publicGroups = async () => [
      group("g1", "Big Unrelated", ["running"], 50),
      group("g2", "Small Pottery", ["pottery"], 3),
      group("g3", "Bigger Pottery", ["pottery", "coffee"], 9),
    ];
    const out = await suggestGroupsFrom({ publicGroups }, viewer, 3);
    expect(out.map((g) => g.id)).toEqual(["g3", "g2", "g1"]);
  });

  it("breaks a full tie on name so suggestions are stable", async () => {
    const publicGroups = async () => [
      group("g2", "Beta", ["pottery"], 4),
      group("g1", "Alpha", ["pottery"], 4),
    ];
    const out = await suggestGroupsFrom({ publicGroups }, viewer, 2);
    expect(out.map((g) => g.name)).toEqual(["Alpha", "Beta"]);
  });

  it("normalises a null description and keeps the member count", async () => {
    const publicGroups = async () => [
      { id: "g1", name: "Nameless", description: null, interests: ["pottery"], memberCount: 7 },
    ];
    const [only] = await suggestGroupsFrom({ publicGroups }, viewer, 3);
    expect(only).toEqual({
      id: "g1",
      name: "Nameless",
      description: "",
      interests: ["pottery"],
      memberCount: 7,
    });
  });

  it("respects the limit and returns nothing when there are no public groups", async () => {
    const publicGroups = async () => [group("g1", "A", ["pottery"], 1), group("g2", "B", ["pottery"], 2)];
    expect(await suggestGroupsFrom({ publicGroups }, viewer, 1)).toHaveLength(1);
    expect(await suggestGroupsFrom({ publicGroups: async () => [] }, viewer, 3)).toEqual([]);
  });
});

describe("production wiring", () => {
  it("passes live rows through and asks the recommender for the viewer's events", async () => {
    vi.resetModules();
    const warn = vi.fn();
    vi.doMock("@/lib/log", () => ({ log: { warn, info: vi.fn(), error: vi.fn() } }));
    vi.doMock("@/features/events", () => ({
      getRecommendedEvents: async (viewerId: string, limit: number) => [
        { ...rec("e1", "Live Event", "live reason"), _viewerId: viewerId, _limit: limit },
      ],
    }));
    vi.doMock("@/features/groups", () => ({
      publicGroups: undefined,
      getPublicGroups: async () => [group("g1", "Live Group", ["pottery"], 5)],
    }));

    const mod = await import("@/features/agent/server/suggestions");
    expect(await mod.suggestEvents("u1", 1)).toEqual([
      expect.objectContaining({ id: "e1", title: "Live Event", explanation: "live reason" }),
    ]);
    expect(await mod.suggestGroups(viewer, 1)).toEqual([
      expect.objectContaining({ id: "g1", name: "Live Group", memberCount: 5 }),
    ]);
    expect(warn).not.toHaveBeenCalled();

    vi.doUnmock("@/features/events");
    vi.doUnmock("@/features/groups");
    vi.doUnmock("@/lib/log");
  });

  it("fails soft and logs when a suggestion source is down, so the chat turn still replies", async () => {
    vi.resetModules();
    const warn = vi.fn();
    vi.doMock("@/lib/log", () => ({ log: { warn, info: vi.fn(), error: vi.fn() } }));
    vi.doMock("@/features/events", () => ({
      getRecommendedEvents: async () => {
        throw new Error("events db down");
      },
    }));
    vi.doMock("@/features/groups", () => ({
      getPublicGroups: async () => {
        throw new Error("groups db down");
      },
    }));

    const mod = await import("@/features/agent/server/suggestions");
    expect(await mod.suggestEvents("u1")).toEqual([]);
    expect(await mod.suggestGroups(viewer)).toEqual([]);

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith("agent.suggestions.unavailable", {
      source: "events",
      error: "events db down",
    });
    expect(warn).toHaveBeenCalledWith("agent.suggestions.unavailable", {
      source: "groups",
      error: "groups db down",
    });

    vi.doUnmock("@/features/events");
    vi.doUnmock("@/features/groups");
    vi.doUnmock("@/lib/log");
  });
});
