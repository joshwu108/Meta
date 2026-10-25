import { describe, expect, it } from "vitest";
import * as repo from "@/features/agent/server/repo";
import { createFakeSupabase, op, type Call } from "./fake-supabase";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
const ok = (data: unknown[]) => ({ data, error: null });
const inIds = (call: Call) => (op(call, "in")?.[1] as string[] | undefined) ?? [];

describe("chunkIds", () => {
  it("splits into chunks of at most 100 and drops duplicates", () => {
    const chunks = repo.chunkIds([...ids(250), ...ids(10)]);
    expect(chunks.map((c) => c.length)).toEqual([100, 100, 50]);
    expect(new Set(chunks.flat()).size).toBe(250);
    expect(repo.chunkIds([])).toEqual([]);
  });
});

describe("batch reads stay under the gateway's URL limit (03's ask)", () => {
  it("adminLoadSources reads 250 users in 3 requests per table and merges the rows", async () => {
    const row = (id: string) => ({ user_id: id, interests: [], interest_categories: [], availability_slots: [], social_goals: [], group_size_pref: null,
      budget_min_cents: null, budget_max_cents: null, travel_radius_km: 5, activity_prefs: [], dealbreakers: [], field_sources: {},
      profiles: { is_discoverable: true, neighborhood: null, coarse_lat: null, coarse_lng: null } });
    const all = ids(250);
    const sb = createFakeSupabase({
      user_preferences: [ok(all.slice(0, 100).map(row)), ok(all.slice(100, 200).map(row)), ok(all.slice(200).map(row))],
      agent_profiles: [ok([]), ok([]), ok([])],
    });
    const sources = await repo.adminLoadSources(sb.client, all);
    expect(sources).toHaveLength(250);
    const prefCalls = sb.calls.filter((c) => c.table === "user_preferences");
    expect(prefCalls).toHaveLength(3);
    expect(prefCalls.every((c) => inIds(c).length <= repo.ID_CHUNK)).toBe(true);
    expect(sb.calls.filter((c) => c.table === "agent_profiles")).toHaveLength(3);
  });

  it("adminRecentShareLogs and adminLoadConsent chunk too", async () => {
    const all = ids(201);
    const logs = createFakeSupabase({ agent_action_log: [ok([{ user_id: all[0] }]), ok([]), ok([{ user_id: all[200] }])] });
    expect(await repo.adminRecentShareLogs(logs.client, all, "matching")).toEqual(new Set([all[0], all[200]]));
    expect(logs.calls.map((c) => inIds(c).length)).toEqual([100, 100, 1]);

    const consent = createFakeSupabase({ agent_profiles: [ok([]), ok([]), ok([])], user_preferences: [ok([]), ok([]), ok([])] });
    expect(await repo.adminLoadConsent(consent.client, all)).toHaveLength(201);
    expect(consent.calls).toHaveLength(6);
  });

  it("fails the whole read if any chunk fails", async () => {
    const all = ids(150);
    const sb = createFakeSupabase({ agent_action_log: [ok([]), { data: null, error: { message: "boom", code: "XX000" } }] });
    await expect(repo.adminRecentShareLogs(sb.client, all, "demand")).rejects.toMatchObject({ code: "INTERNAL" });
  });
});
