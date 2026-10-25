import { describe, expect, it } from "vitest";
import { shareBatch, type SharableSource } from "@/features/agent/server/sharable";
import { parseConsent } from "@/features/agent/server/rows";
import { UserPreferencesSchema } from "@/features/agent/schemas";
import { DEMAND_OPT_OUT_EMAILS, SEED_PREFERENCES } from "../../fixtures/consent-cases";

const sources: SharableSource[] = SEED_PREFERENCES.map((u) => ({
  userId: u.email,
  preferences: UserPreferencesSchema.parse(u.preferences),
  consent: parseConsent(u.consent),
  isDiscoverable: true,
  neighborhood: u.neighborhood,
  coarseLat: u.coarseLat,
  coarseLng: u.coarseLng,
}));
const deps = {
  loadSources: async (ids: readonly string[]) => sources.filter((s) => ids.includes(s.userId)),
  recentlyLogged: async () => new Set<string>(),
  writeLogs: async () => undefined,
};
const everyone = sources.map((s) => s.userId);

describe("AC3 consent boundary on the seed data", () => {
  it("demand aggregation never receives the opted-out user", async () => {
    expect(DEMAND_OPT_OUT_EMAILS).toHaveLength(1);
    const shared = await shareBatch(deps, everyone, "demand");
    for (const email of DEMAND_OPT_OUT_EMAILS) expect(shared.has(email)).toBe(false);
    expect(shared.size).toBe(everyone.length - DEMAND_OPT_OUT_EMAILS.length);
  });

  it("matching drops users with consent off or who are not discoverable", async () => {
    const hidden = sources.map((s, i) => (i === 0 ? { ...s, isDiscoverable: false } : i === 1 ? { ...s, consent: { ...s.consent, allow_matching: false } } : s));
    const shared = await shareBatch({ ...deps, loadSources: async () => hidden }, everyone, "matching");
    expect(shared.has(everyone[0]!)).toBe(false);
    expect(shared.has(everyone[1]!)).toBe(false);
    expect(shared.size).toBe(everyone.length - 2);
  });

  it("the 6-person creative / thu_eve cohort survives demand sharing intact", async () => {
    const shared = [...(await shareBatch(deps, everyone, "demand")).values()];
    const cohort = shared.filter((p) => p.availabilitySlots.includes("thu_eve") &&
      p.interests.some((i) => ["pottery", "ceramics", "painting"].includes(i)) &&
      ["Mission District", "Castro", "Noe Valley"].includes(p.neighborhood ?? ""));
    expect(cohort).toHaveLength(6);
  });
});
