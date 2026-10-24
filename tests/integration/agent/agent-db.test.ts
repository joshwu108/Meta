import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, deleteUser, makeUser, supabaseAvailable } from "./setup";
import { confirmOnboarding, handleOnboardingMessage } from "@/features/agent/server/onboarding";
import { patchPreferences } from "@/features/agent/server/preferences";
import { getPreferences } from "@/features/agent/server/repo";
import { DEFAULT_CONSENT } from "@/features/agent/schemas";

const available = await supabaseAvailable();
const SCENE_1 = "I just moved here, I like pottery and coffee shops, free Thursday evenings, small groups.";

describe.skipIf(!available)("ws02 integration (local Supabase, MOCK_AI)", () => {
  let a: Awaited<ReturnType<typeof makeUser>>;
  let b: Awaited<ReturnType<typeof makeUser>>;

  beforeAll(async () => {
    a = await makeUser("a");
    b = await makeUser("b");
  });
  afterAll(async () => {
    await Promise.all([a && deleteUser(a.id), b && deleteUser(b.id)]);
  });

  it("onboarding chat writes ai_inferred fields", async () => {
    const res = await handleOnboardingMessage(a.sb, a.id, SCENE_1);
    expect(res.done).toBe(true);
    const prefs = await getPreferences(a.sb, a.id);
    expect(prefs).toMatchObject({ availabilitySlots: ["thu_eve"], groupSizePref: "small", budgetMaxCents: null });
    expect(prefs.interests).toEqual(expect.arrayContaining(["pottery", "coffee"]));
    expect(prefs.fieldSources.interests).toBe("ai_inferred");
  });

  it("confirm flips to user_set and sets onboarding_completed_at", async () => {
    await confirmOnboarding(a.sb, a.id, { discoverable: true, consent: { ...DEFAULT_CONSENT, allow_matching: true } });
    const prefs = await getPreferences(a.sb, a.id);
    expect(new Set(Object.values(prefs.fieldSources))).toEqual(new Set(["user_set"]));
    const { data } = await a.sb.from("profiles").select("onboarding_completed_at, is_discoverable").eq("id", a.id).single();
    expect(data?.onboarding_completed_at).not.toBeNull();
    expect(data?.is_discoverable).toBe(true);
  });

  it("deleting an inferred value persists (AC2)", async () => {
    await patchPreferences(a.sb, a.id, { interests: ["pottery"] });
    expect((await getPreferences(a.sb, a.id)).interests).toEqual(["pottery"]);
  });

  it("RLS: a user cannot read or edit another user's preferences or messages", async () => {
    const read = await b.sb.from("user_preferences").select("user_id").eq("user_id", a.id);
    expect(read.data).toEqual([]);
    const write = await b.sb.from("user_preferences").update({ interests: ["hacked"] }).eq("user_id", a.id).select();
    expect(write.data).toEqual([]);
    const msgs = await b.sb.from("agent_messages").select("id");
    expect(msgs.data).toEqual([]);
    expect((await getPreferences(a.sb, a.id)).interests).toEqual(["pottery"]);
  });

  it("logs a share row per purpose and respects consent (AC3, AC5)", async () => {
    const { getSharablePreferencesBatch } = await import("@/features/agent");
    const shared = await getSharablePreferencesBatch([a.id, b.id], "matching");
    expect([...shared.keys()]).toEqual([a.id]);
    expect(await getSharablePreferencesBatch([a.id], "demand")).toEqual(new Map());
    const { data } = await admin().from("agent_action_log").select("permissions_used").eq("user_id", a.id).eq("action", "share_preferences");
    expect(data).toEqual([{ permissions_used: ["matching"] }]);
    const own = await a.sb.from("agent_action_log").select("action").eq("action", "share_preferences");
    expect(own.data).toHaveLength(1);
  });
});
