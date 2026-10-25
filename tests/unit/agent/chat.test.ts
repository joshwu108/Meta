import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeRepo } from "./fake-repo";

const fake = createFakeRepo();
const logs: Record<string, unknown>[] = [];
vi.mock("@/features/agent/server/repo", () => fake.repo);
vi.mock("@/features/core", () => ({
  logAgentAction: async (input: Record<string, unknown>) => {
    logs.push(input);
  },
}));
vi.mock("@/lib/ai", async () => (await import("./mock-ai")).mockAi);
// Live suggestion sources (06 events, 03 groups, 01 people) need a database; stand in for them
// here with rows in the exact shape those features return, including 06's grounded explanation.
vi.mock("@/features/agent/server/suggestions/events", () => ({
  suggestEvents: async () => [{ id: "00000000-0000-4000-8000-000000000601", title: "Beginner Pottery & Coffee Night", startsAt: "2026-10-29T19:00:00-07:00", venue: "Kiln & Cup", category: "creative", description: "Throw your first bowl.", explanation: "Pottery on a Thursday evening, close to you." }],
}));
vi.mock("@/features/agent/server/suggestions/groups", () => ({
  suggestGroups: async () => [{ id: "00000000-0000-4000-8000-000000000301", name: "Mission Makers", description: "Pottery on Thursdays.", memberCount: 4 }],
}));
vi.mock("@/features/agent/server/suggestions/people", () => ({
  suggestPeople: async () => [{
    id: "00000000-0000-4000-8000-000000000101", displayName: "Maya", neighborhood: "Mission",
    preferences: {
      userId: "00000000-0000-4000-8000-000000000101", interests: ["pottery", "coffee", "painting"], interestCategories: ["creative"],
      availabilitySlots: ["thu_eve"], socialGoals: ["make_friends"], groupSizePref: "small", budgetMin: null, budgetMax: 2500,
      travelRadiusKm: 5, activityPrefs: [], coarseLat: 37.76, coarseLng: -122.42, neighborhood: "Mission",
    },
  }],
}));
vi.mock("@/features/events", () => ({
  getRecommendedEvents: async () => [{
    event: {
      id: "00000000-0000-4000-8000-000000000601", title: "Beginner Pottery & Coffee Night", startsAt: "2026-10-29T19:00:00-07:00",
      business: { name: "Kiln & Cup" }, category: "creative", description: "Throw your first bowl with coffee on the side.",
    },
  }],
}));

const { handleChatMessage, loadChatHistory, runCapabilities, selfView } = await import("@/features/agent/server/chat");
const { DEFAULT_CONSENT, EMPTY_PREFERENCES } = await import("@/features/agent/schemas");

const SB = {} as never;
const viewer = selfView("u1", { ...EMPTY_PREFERENCES, interests: ["pottery", "coffee"], availabilitySlots: ["thu_eve"] });

beforeEach(() => {
  fake.state.convs.clear();
  logs.length = 0;
});

describe("runCapabilities", () => {
  it("builds person cards that deep-link to /match and explain why", async () => {
    const cards = await runCapabilities("u1", viewer, [{ name: "suggest_people" }]);
    expect(cards.length).toBeGreaterThan(0);
    for (const c of cards) {
      expect(c.kind).toBe("person");
      expect(c.href).toBe(`/match?focus=${c.targetId}`);
      expect(c.explanation.length).toBeGreaterThan(0);
    }
    expect(cards[0]!.highlights).toContain("pottery");
  });

  it("builds event and group cards with the right links", async () => {
    const cards = await runCapabilities("u1", viewer, [{ name: "suggest_events" }, { name: "suggest_groups" }]);
    expect(cards.filter((c) => c.kind === "event").every((c) => c.href === `/events/${c.targetId}`)).toBe(true);
    expect(cards.filter((c) => c.kind === "group").every((c) => c.href === `/groups/${c.targetId}`)).toBe(true);
    expect(cards.some((c) => c.kind === "group")).toBe(true);
    expect(cards.every((c) => c.explanation)).toBe(true);
  });

  it("turns update_preference into an Apply card and never saves it", async () => {
    const cards = await runCapabilities("u1", viewer, [
      { name: "update_preference", patch: { availabilitySlots: ["sat_day"] } },
    ]);
    expect(cards).toEqual([
      expect.objectContaining({ kind: "preference_update", href: "/agent/preferences", patch: { availabilitySlots: ["sat_day"] } }),
    ]);
    expect(fake.repo.savePreferences).not.toHaveBeenCalled();
  });

  it("ignores an update_preference without a patch and caps at 6 cards", async () => {
    expect(await runCapabilities("u1", viewer, [{ name: "update_preference" }])).toEqual([]);
    const many = await runCapabilities("u1", viewer, [
      { name: "suggest_people" }, { name: "suggest_events" }, { name: "suggest_groups" },
    ]);
    expect(many.length).toBeLessThanOrEqual(6);
  });
});

describe("handleChatMessage (MOCK_AI)", () => {
  it("replies, stores both messages with suggestions, and logs", async () => {
    const res = await handleChatMessage(SB, "u1", "find me some people to hang out with");
    expect(res.reply).toMatch(/people/);
    expect(res.suggestions?.[0]?.kind).toBe("person");
    const msgs = fake.state.convs.get(res.conversationId)!.messages;
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(msgs[1]!.suggestions).toHaveLength(res.suggestions!.length);
    expect(logs).toContainEqual(expect.objectContaining({ action: "chat_suggestions" }));
  });

  it("defaults to people and event suggestions", async () => {
    const res = await handleChatMessage(SB, "u1", "anything fun this week?");
    expect(new Set(res.suggestions?.map((s) => s.kind))).toEqual(new Set(["person", "event"]));
  });

  it("tells a user with matching off how to see people, and says nothing when it is on", async () => {
    fake.state.agent.set("off", { summary: null, consent: { ...DEFAULT_CONSENT, allow_matching: false } });
    const off = await handleChatMessage(SB, "off", "who should I meet?");
    expect(off.reply).toContain('turn on "Match me with people" in Permissions');
    const stored = fake.state.convs.get(off.conversationId)!.messages[1]!;
    expect(stored.content).toBe(off.reply);

    fake.state.agent.set("on", { summary: null, consent: { ...DEFAULT_CONSENT, allow_matching: true } });
    const on = await handleChatMessage(SB, "on", "who should I meet?");
    expect(on.reply).not.toContain("Match me with people");
  });
});

describe("chat prompt context", () => {
  it("includes the last feedback notes in the model input", async () => {
    vi.resetModules();
    const seen: unknown[] = [];
    vi.doMock("@/lib/ai", () => ({
      generateStructured: async (o: { input: unknown; prompt: string }) => {
        if (o.prompt === "agent.chat") seen.push(o.input);
        return o.prompt === "agent.chat"
          ? { reply: "ok", capabilities: [] }
          : { explanation: "x", highlights: [] };
      },
    }));
    fake.state.feedback.set("u9", [{ at: "t", about: "event:42", signal: "down", note: "too loud" }]);
    const chat = await import("@/features/agent/server/chat");
    await chat.handleChatMessage(SB, "u9", "hi");
    expect(seen[0]).toMatchObject({ feedback: [{ about: "event:42", signal: "down", note: "too loud" }] });
    vi.doUnmock("@/lib/ai");
  });
});

describe("loadChatHistory", () => {
  it("returns nothing for a user who has never chatted, and creates no conversation", async () => {
    const before = fake.state.convs.size;
    expect(await loadChatHistory(SB, "never-chatted")).toEqual({ conversationId: null, messages: [] });
    expect(fake.state.convs.size).toBe(before);
  });

  it("returns the latest chat with its suggestion cards, oldest first", async () => {
    const first = await handleChatMessage(SB, "hist", "find me people");
    await handleChatMessage(SB, "hist", "and events?", first.conversationId);
    const history = await loadChatHistory(SB, "hist");
    expect(history.conversationId).toBe(first.conversationId);
    expect(history.messages.map((m) => [m.role, m.content.slice(0, 12)])).toEqual([
      ["user", "find me peop"],
      ["assistant", first.reply.slice(0, 12)],
      ["user", "and events?"],
      ["assistant", expect.any(String)],
    ]);
    expect(history.messages[1]!.suggestions?.length).toBeGreaterThan(0);
  });
});
