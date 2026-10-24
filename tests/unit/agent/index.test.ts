import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, op } from "./fake-supabase";

let fake = createFakeSupabase();
vi.mock("@/features/agent/server/stubs", async (orig) => ({
  ...(await orig<typeof import("@/features/agent/server/stubs")>()),
  getAdminClient: () => fake.client,
}));
const agent = await import("@/features/agent");

const consent = (over: Record<string, boolean> = {}) => ({
  allow_matching: false, allow_demand_aggregation: false, allow_group_planning: false,
  share_interests_with_attendees: false, share_name_with_business: false, ...over,
});

describe("getAttendeeSharing", () => {
  beforeEach(() => {
    fake = createFakeSupabase({
      agent_profiles: [{ data: [
        { user_id: "a", consent: consent({ share_interests_with_attendees: true }) },
        { user_id: "b", consent: consent() },
      ], error: null }],
      user_preferences: [{ data: [
        { user_id: "a", interests: ["pottery", "coffee"] },
        { user_id: "b", interests: ["hiking"] },
      ], error: null }],
      agent_action_log: [{ data: [], error: null }, { data: null, error: null }],
    });
  });

  it("releases interests only for users who opted in, and returns everyone", async () => {
    const out = await agent.getAttendeeSharing(["a", "b", "c", "a"]);
    expect(out.get("a")).toEqual({ interests: ["pottery", "coffee"], shareInterestsWithAttendees: true });
    expect(out.get("b")).toEqual({ interests: [], shareInterestsWithAttendees: false });
    expect(out.get("c")).toEqual({ interests: [], shareInterestsWithAttendees: false });
    expect(out.size).toBe(3);
  });

  it("logs a share row only for users whose interests were released", async () => {
    await agent.getAttendeeSharing(["a", "b"]);
    const insert = fake.calls.find((c) => c.table === "agent_action_log" && op(c, "insert"));
    const [rows] = op(insert!, "insert") as [{ user_id: string; permissions_used: string[]; result: string }[]];
    expect(rows).toEqual([expect.objectContaining({ user_id: "a", permissions_used: ["attendees"] })]);
    expect(rows[0].result).toMatch(/fellow attendees/);
  });

  it("does not query anything for an empty list", async () => {
    expect((await agent.getAttendeeSharing([])).size).toBe(0);
    expect(fake.calls).toHaveLength(0);
  });
});

describe("getConsent", () => {
  it("returns stored flags, defaulting missing ones to off", async () => {
    fake = createFakeSupabase({
      agent_profiles: [{ data: [{ user_id: "a", consent: { share_name_with_business: true } }], error: null }],
      user_preferences: [{ data: [], error: null }],
    });
    expect(await agent.getConsent("a")).toEqual(consent({ share_name_with_business: true }));
  });

  it("is all off for a user with no agent profile", async () => {
    fake = createFakeSupabase({ agent_profiles: [{ data: [], error: null }], user_preferences: [{ data: [], error: null }] });
    expect(await agent.getConsent("nobody")).toEqual(consent());
  });
});

describe("getSharablePreferences wiring", () => {
  it("returns null when the user has not consented", async () => {
    fake = createFakeSupabase({
      user_preferences: [{ data: [{
        user_id: "a", interests: ["pottery"], interest_categories: [], availability_slots: ["thu_eve"], social_goals: [],
        group_size_pref: null, budget_min_cents: null, budget_max_cents: null, travel_radius_km: 5, activity_prefs: [],
        dealbreakers: [], field_sources: {}, profiles: { is_discoverable: true, neighborhood: "Castro", coarse_lat: 37.76, coarse_lng: -122.43 },
      }], error: null }],
      agent_profiles: [{ data: [{ user_id: "a", consent: consent({ allow_demand_aggregation: true }) }], error: null }],
      agent_action_log: [{ data: [], error: null }, { data: null, error: null }],
    });
    expect(await agent.getSharablePreferences("a", "matching")).toBeNull();
  });
});
