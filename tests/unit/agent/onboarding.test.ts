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

const { handleOnboardingMessage, confirmOnboarding, saveBasics } = await import(
  "@/features/agent/server/onboarding"
);
const { DEFAULT_CONSENT } = await import("@/features/agent/schemas");

const SB = {} as never;
const SCENE_1 =
  "I just moved here, I like pottery and coffee shops, free Thursday evenings, small groups.";

beforeEach(() => {
  fake.state.prefs.clear();
  fake.state.agent.clear();
  fake.state.convs.clear();
  fake.state.profiles.clear();
  logs.length = 0;
});

describe("onboarding loop (MOCK_AI)", () => {
  it("Scene 1: one message extracts pottery, coffee, thu_eve, small and finishes", async () => {
    const res = await handleOnboardingMessage(SB, "u1", SCENE_1);
    expect(res.done).toBe(true);
    expect(res.reply).toContain("pottery, coffee, Thursday evenings, small groups");
    const prefs = fake.state.prefs.get("u1")!;
    expect(prefs.interests).toEqual(expect.arrayContaining(["pottery", "coffee"]));
    expect(prefs.availabilitySlots).toEqual(["thu_eve"]);
    expect(prefs.groupSizePref).toBe("small");
    expect(prefs.budgetMaxCents).toBeNull();
    expect(prefs.budgetMinCents).toBeNull();
    expect(prefs.fieldSources.interests).toBe("ai_inferred");
    expect(prefs.fieldSources.availabilitySlots).toBe("ai_inferred");
    expect(fake.state.agent.get("u1")?.summary).toMatch(/pottery/);
    expect(logs).toContainEqual(expect.objectContaining({ userId: "u1", action: "extract_preferences" }));
  });

  it("asks a follow-up when the message is vague, then stops asking after 3", async () => {
    const first = await handleOnboardingMessage(SB, "u2", "hi there");
    expect(first.done).toBe(false);
    expect(first.reply).toMatch(/\?$/);
    const id = first.conversationId;
    const second = await handleOnboardingMessage(SB, "u2", "not sure", id);
    const third = await handleOnboardingMessage(SB, "u2", "hmm", id);
    const fourth = await handleOnboardingMessage(SB, "u2", "dunno", id);
    expect([second.done, third.done, fourth.done]).toEqual([false, false, true]);
    expect(fake.state.convs.get(id)!.messages).toHaveLength(8);
  });

  it("continues an existing conversation and remembers earlier turns", async () => {
    const first = await handleOnboardingMessage(SB, "u3", "hello");
    await handleOnboardingMessage(SB, "u3", SCENE_1, first.conversationId);
    expect(fake.state.prefs.get("u3")!.availabilitySlots).toEqual(["thu_eve"]);
  });
});

describe("confirmOnboarding", () => {
  it("flips every field to user_set, stores consent, completes onboarding", async () => {
    await handleOnboardingMessage(SB, "u1", SCENE_1);
    const consent = { ...DEFAULT_CONSENT, allow_matching: true };
    await confirmOnboarding(SB, "u1", { discoverable: true, consent });
    const prefs = fake.state.prefs.get("u1")!;
    expect(new Set(Object.values(prefs.fieldSources))).toEqual(new Set(["user_set"]));
    expect(fake.state.agent.get("u1")?.consent).toEqual(consent);
    const profile = fake.state.profiles.get("u1")!;
    expect(profile.is_discoverable).toBe(true);
    expect(typeof profile.onboarding_completed_at).toBe("string");
    expect(logs).toContainEqual(
      expect.objectContaining({ action: "confirm_preferences", permissionsUsed: ["allow_matching"] }),
    );
  });
});

describe("saveBasics", () => {
  it("rounds coordinates to 2 dp and marks travel radius as user_set", async () => {
    await saveBasics(SB, "u1", {
      step: "basics", neighborhood: "Mission", coarseLat: 37.75993, coarseLng: -122.41482, travelRadiusKm: 3,
    });
    expect(fake.state.profiles.get("u1")).toEqual({ neighborhood: "Mission", coarse_lat: 37.76, coarse_lng: -122.41 });
    expect(fake.state.prefs.get("u1")).toMatchObject({ travelRadiusKm: 3, fieldSources: { travelRadiusKm: "user_set" } });
  });
});
