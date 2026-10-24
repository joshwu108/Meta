import { describe, expect, it, vi } from "vitest";
import * as repo from "@/features/agent/server/repo";
import { DEFAULT_CONSENT, EMPTY_PREFERENCES } from "@/features/agent/schemas";
import { createFakeSupabase, op } from "./fake-supabase";

const prefRow = {
  user_id: "u1", interests: ["pottery"], interest_categories: ["creative"], availability_slots: ["thu_eve"],
  social_goals: [], group_size_pref: "small", budget_min_cents: null, budget_max_cents: null,
  travel_radius_km: "5.0", activity_prefs: [], dealbreakers: ["no-alcohol"], field_sources: { interests: "ai_inferred" },
};

describe("repo: preferences", () => {
  it("loads and maps the caller's row", async () => {
    const sb = createFakeSupabase({ user_preferences: [{ data: prefRow, error: null }] });
    const prefs = await repo.getPreferences(sb.client, "u1");
    expect(prefs).toMatchObject({ interests: ["pottery"], travelRadiusKm: 5, fieldSources: { interests: "ai_inferred" } });
    expect(op(sb.calls[0]!, "eq")).toEqual(["user_id", "u1"]);
  });

  it("upserts snake_case columns with field sources", async () => {
    const sb = createFakeSupabase({ user_preferences: [{ data: prefRow, error: null }] });
    await repo.savePreferences(sb.client, "u1", { ...EMPTY_PREFERENCES, interests: ["pottery"], fieldSources: { interests: "user_set" } });
    const [row] = op(sb.calls[0]!, "upsert") as [Record<string, unknown>];
    expect(row).toMatchObject({ user_id: "u1", interests: ["pottery"], availability_slots: [], field_sources: { interests: "user_set" } });
    expect(row).not.toHaveProperty("fieldSources");
  });

  it("wraps database errors as INTERNAL without leaking the message", async () => {
    const sb = createFakeSupabase({ user_preferences: [{ data: null, error: { message: "secret detail", code: "42P01" } }] });
    await expect(repo.getPreferences(sb.client, "u1")).rejects.toMatchObject({ code: "INTERNAL", message: "Failed to load preferences" });
  });
});

describe("repo: agent profile and conversations", () => {
  it("defaults consent when no row exists and stamps consent_updated_at on save", async () => {
    const sb = createFakeSupabase({ agent_profiles: [{ data: null, error: null }, { data: { summary: null, consent: { allow_matching: true } }, error: null }] });
    expect(await repo.getAgentProfile(sb.client, "u1")).toEqual({ summary: null, consent: DEFAULT_CONSENT });
    const saved = await repo.saveAgentProfile(sb.client, "u1", { consent: { ...DEFAULT_CONSENT, allow_matching: true } });
    expect(saved.consent.allow_matching).toBe(true);
    const [row] = op(sb.calls[1]!, "upsert") as [Record<string, unknown>];
    expect(row).toHaveProperty("consent_updated_at");
  });

  it("reuses the latest conversation, creates one when none, and 404s a foreign id", async () => {
    const sb = createFakeSupabase({
      agent_conversations: [
        { data: { id: "c1" }, error: null },
        { data: null, error: null }, { data: { id: "c2" }, error: null },
        { data: null, error: null },
      ],
    });
    expect(await repo.resolveConversation(sb.client, "u1", "chat")).toBe("c1");
    expect(await repo.resolveConversation(sb.client, "u1", "chat")).toBe("c2");
    expect(op(sb.calls[2]!, "insert")).toEqual([{ user_id: "u1", kind: "chat" }]);
    await expect(repo.resolveConversation(sb.client, "u1", "chat", "other")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns messages oldest first and writes ordered timestamps", async () => {
    const sb = createFakeSupabase({
      agent_messages: [
        { data: [{ role: "assistant", content: "b", suggestions: null }, { role: "user", content: "a", suggestions: null }], error: null },
        { data: null, error: null },
      ],
    });
    expect((await repo.listMessages(sb.client, "c1")).map((m) => m.content)).toEqual(["a", "b"]);
    await repo.addMessages(sb.client, "c1", [
      { role: "user", content: "x", suggestions: null },
      { role: "assistant", content: "y", suggestions: null },
    ]);
    const [rows] = op(sb.calls[1]!, "insert") as [{ created_at: string }[]];
    expect(rows[0]!.created_at < rows[1]!.created_at).toBe(true);
  });

  it("updates the profile and lists the caller's log", async () => {
    const sb = createFakeSupabase({ profiles: [{ data: null, error: null }], agent_action_log: [{ data: [], error: null }] });
    await repo.updateProfile(sb.client, "u1", { neighborhood: "Mission" });
    expect(op(sb.calls[0]!, "eq")).toEqual(["id", "u1"]);
    expect(await repo.listAgentLog(sb.client, "u1", 10)).toEqual([]);
    expect(op(sb.calls[1]!, "limit")).toEqual([10]);
  });
});

describe("repo: service-role sharing reads", () => {
  it("joins profile fields and consent per user, without field sources", async () => {
    const admin = createFakeSupabase({
      user_preferences: [{ data: [{ ...prefRow, profiles: { is_discoverable: true, neighborhood: "Mission", coarse_lat: "37.76", coarse_lng: "-122.42" } }], error: null }],
      agent_profiles: [{ data: [{ user_id: "u1", consent: { allow_matching: true } }], error: null }],
    });
    const [src] = await repo.adminLoadSources(admin.client, ["u1"]);
    expect(src).toMatchObject({ userId: "u1", isDiscoverable: true, coarseLat: 37.76, consent: { allow_matching: true, allow_demand_aggregation: false } });
    expect(src!.preferences).not.toHaveProperty("fieldSources");
  });

  it("finds recent share logs and writes one row per user", async () => {
    const admin = createFakeSupabase({ agent_action_log: [{ data: [{ user_id: "a" }], error: null }, { data: null, error: null }] });
    expect(await repo.adminRecentShareLogs(admin.client, ["a", "b"], "matching")).toEqual(new Set(["a"]));
    expect(op(admin.calls[0]!, "contains")).toEqual(["permissions_used", ["matching"]]);
    await repo.adminWriteShareLogs(admin.client, ["b"], "matching");
    const [rows] = op(admin.calls[1]!, "insert") as [Record<string, unknown>[]];
    expect(rows).toEqual([expect.objectContaining({ user_id: "b", actor: "coordination", action: "share_preferences", permissions_used: ["matching"] })]);
  });

  it("never throws when writing the share log fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const admin = createFakeSupabase({ agent_action_log: [{ data: null, error: { message: "x", code: "1" } }] });
    await expect(repo.adminWriteShareLogs(admin.client, ["b"], "demand")).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
