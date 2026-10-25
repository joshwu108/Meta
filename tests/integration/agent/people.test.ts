// 01's integration project sets no MOCK_AI; these tests must never call the live model.
process.env.MOCK_AI = "1";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, deleteUser, makeUser, supabaseAvailable } from "./setup";
import { suggestPeople } from "@/features/agent/server/people";
import { DEFAULT_CONSENT } from "@/features/agent/schemas";

const available = await supabaseAvailable();

type Seeded = { id: string };

async function person(tag: string, opts: { discoverable: boolean; allowMatching: boolean; interests: string[] }): Promise<Seeded> {
  const { id } = await makeUser(tag);
  const db = admin();
  const must = (r: { error: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message);
  };
  must(await db.from("profiles").update({ display_name: `Test ${tag}`, is_discoverable: opts.discoverable, neighborhood: "Mission District" }).eq("id", id));
  must(await db.from("user_preferences").upsert({ user_id: id, interests: opts.interests, availability_slots: ["thu_eve"] }));
  must(await db.from("agent_profiles").upsert({ user_id: id, consent: { ...DEFAULT_CONSENT, allow_matching: opts.allowMatching } }));
  return { id };
}

describe.skipIf(!available)("suggest_people against local Supabase", () => {
  const made: string[] = [];
  let match: Seeded;
  let noConsent: Seeded;
  let hidden: Seeded;

  beforeAll(async () => {
    match = await person("match", { discoverable: true, allowMatching: true, interests: ["quilting-it"] });
    noConsent = await person("noconsent", { discoverable: true, allowMatching: false, interests: ["quilting-it"] });
    hidden = await person("hidden", { discoverable: false, allowMatching: true, interests: ["quilting-it"] });
    made.push(match.id, noConsent.id, hidden.id);
  });

  afterAll(async () => {
    await Promise.all(made.map(deleteUser));
  });

  it("suggests only discoverable people who allowed matching, never the viewer", async () => {
    const viewer = { userId: match.id, interests: ["quilting-it"], availabilitySlots: [] };
    const outsider = await suggestPeople({ ...viewer, userId: "00000000-0000-4000-8000-0000000000ff" }, 50);
    const ids = outsider.map((p) => p.id);
    expect(ids).toContain(match.id);
    expect(ids).not.toContain(noConsent.id);
    expect(ids).not.toContain(hidden.id);

    const self = await suggestPeople(viewer, 50);
    expect(self.map((p) => p.id)).not.toContain(match.id);
  });

  it("logs the matching share for each suggested person (AC5)", async () => {
    const { data } = await admin()
      .from("agent_action_log")
      .select("permissions_used")
      .eq("user_id", match.id)
      .eq("action", "share_preferences");
    expect((data ?? []).some((r) => (r.permissions_used as string[]).includes("matching"))).toBe(true);
  });
});
