import { describe, expect, it } from "vitest";
import fixtures from "../../../supabase/seed/fixtures/preferences.json";
import { ConsentSchema, UserPreferencesSchema } from "@/features/agent/schemas";

describe("preferences.json seed", () => {
  it("has 14 users that all validate", () => {
    expect(fixtures).toHaveLength(14);
    for (const f of fixtures) {
      expect(UserPreferencesSchema.safeParse(f.preferences).success).toBe(true);
      expect(ConsentSchema.safeParse(f.consent).success).toBe(true);
      expect(f.summary.length).toBeGreaterThan(0);
    }
  });

  it("has the 6-user creative / thu_eve cluster near Kiln & Cup", () => {
    const cluster = fixtures.filter(
      (f) =>
        f.preferences.interestCategories.includes("creative") &&
        f.preferences.availabilitySlots.includes("thu_eve") &&
        ["Mission District", "Castro", "Noe Valley"].includes(f.neighborhood),
    );
    expect(cluster).toHaveLength(6);
    for (const f of cluster) {
      expect(f.preferences.interests.some((i) => ["pottery", "ceramics", "painting"].includes(i))).toBe(true);
      expect(f.preferences.groupSizePref).toBe("small");
      expect(f.preferences.budgetMaxCents).toBeGreaterThanOrEqual(2000);
      expect(f.preferences.budgetMaxCents).toBeLessThanOrEqual(3000);
      expect(f.consent.allow_matching && f.consent.allow_demand_aggregation).toBe(true);
    }
  });

  it("has the 4-user board-games / fri_eve cluster for Meeple House", () => {
    const cluster = fixtures.filter(
      (f) => f.preferences.interests.includes("board-games") && f.preferences.availabilitySlots.includes("fri_eve") &&
        ["SoMa", "Mission District"].includes(f.neighborhood) && (f.preferences.budgetMaxCents ?? 0) <= 1500,
    );
    expect(cluster.length).toBeGreaterThanOrEqual(4);
  });

  it("includes exactly one demand opt-out", () => {
    expect(fixtures.filter((f) => !f.consent.allow_demand_aggregation)).toHaveLength(1);
  });
});

describe("loadAgentPreferences", () => {
  it("upserts known users and skips unknown emails", async () => {
    const { loadAgentPreferences } = await import("../../../supabase/seed/agent");
    const { createFakeSupabase, op } = await import("./fake-supabase");
    const sb = createFakeSupabase();
    const logs: string[] = [];
    const ids = new Map([["maya@weave.test", "id-maya"], ["leo@weave.test", "id-leo"]]);
    expect(await loadAgentPreferences({ admin: sb.client, usersByEmail: ids, log: (m) => logs.push(m) })).toBe(2);
    const [prefs] = op(sb.calls[0]!, "upsert") as [{ user_id: string; field_sources: Record<string, string> }[]];
    expect(prefs.map((r) => r.user_id)).toEqual(["id-maya", "id-leo"]);
    expect(Object.values(prefs[0]!.field_sources).every((v) => v === "user_set")).toBe(true);
    expect(logs.filter((l) => l.includes("skipping"))).toHaveLength(12);
  });

  it("writes nothing when no users are known", async () => {
    const { loadAgentPreferences } = await import("../../../supabase/seed/agent");
    const { createFakeSupabase } = await import("./fake-supabase");
    const sb = createFakeSupabase();
    expect(await loadAgentPreferences({ admin: sb.client, usersByEmail: new Map() })).toBe(0);
    expect(sb.calls).toHaveLength(0);
  });
});
