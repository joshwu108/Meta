import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, deleteUser, makeUser, supabaseAvailable } from "./setup";
import { getSharablePreferencesBatch } from "@/features/agent";
import { DEFAULT_CONSENT } from "@/features/agent/schemas";

const available = await supabaseAvailable();

/** 03 measured the local gateway rejecting one `.in()` over ~200 uuids with 414; 02's batch reads must chunk. */
describe.skipIf(!available)("getSharablePreferencesBatch with hundreds of ids", () => {
  let realId: string;

  beforeAll(async () => {
    realId = (await makeUser("batch")).id;
    const db = admin();
    await db.from("user_preferences").upsert({ user_id: realId, interests: ["pottery"], availability_slots: ["thu_eve"] });
    await db.from("agent_profiles").upsert({ user_id: realId, consent: { ...DEFAULT_CONSENT, allow_demand_aggregation: true } });
  });

  afterAll(async () => {
    await deleteUser(realId);
  });

  it("reads 300 ids without a 414 and still returns the consenting user", async () => {
    const filler = Array.from({ length: 299 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    const shared = await getSharablePreferencesBatch([...filler, realId], "demand");
    expect([...shared.keys()]).toEqual([realId]);
    expect(shared.get(realId)?.interests).toEqual(["pottery"]);
  });
});
