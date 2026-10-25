import { describe, expect, it, vi } from "vitest";
import type { SharablePreferences } from "@/shared/types";

const { suggestPeopleFrom, adminPublicCards } = await import("@/features/agent/server/people");

const prefs = (userId: string, interests: string[], slots: SharablePreferences["availabilitySlots"] = []): SharablePreferences => ({
  userId, interests, interestCategories: [], availabilitySlots: slots, socialGoals: [], groupSizePref: null,
  budgetMin: null, budgetMax: null, travelRadiusKm: 5, activityPrefs: [], coarseLat: null, coarseLng: null, neighborhood: null,
});

const viewer = { userId: "me", interests: ["pottery", "coffee"], availabilitySlots: ["thu_eve" as const] };

function deps(cards: { id: string; display_name: string; neighborhood: string | null }[], shared: SharablePreferences[]) {
  return {
    viewerAllowsMatching: vi.fn(async () => true),
    publicCards: vi.fn(async () => cards),
    sharable: vi.fn(async (ids: readonly string[]) => new Map(shared.filter((p) => ids.includes(p.userId)).map((p) => [p.userId, p]))),
  };
}

describe("suggestPeopleFrom", () => {
  it("shows nobody to a viewer who has not allowed matching, and reads no one (AC3)", async () => {
    const d = { ...deps([{ id: "a", display_name: "Ana", neighborhood: null }], [prefs("a", ["pottery"])]), viewerAllowsMatching: vi.fn(async () => false) };
    expect(await suggestPeopleFrom(d, viewer)).toEqual([]);
    expect(d.viewerAllowsMatching).toHaveBeenCalledWith("me");
    expect(d.publicCards).not.toHaveBeenCalled();
    expect(d.sharable).not.toHaveBeenCalled();
  });

  it("returns real consented people ranked by shared interests then slots", async () => {
    const d = deps(
      [
        { id: "a", display_name: "Ana", neighborhood: "Noe Valley" },
        { id: "b", display_name: "Ben", neighborhood: null },
        { id: "c", display_name: "Cy", neighborhood: "Castro" },
      ],
      [prefs("a", ["pottery"], ["thu_eve"]), prefs("b", ["pottery", "coffee"]), prefs("c", ["hiking"], ["thu_eve"])],
    );
    const out = await suggestPeopleFrom(d, viewer);
    expect(out.map((p) => p.id)).toEqual(["b", "a", "c"]);
    expect(out[1]).toMatchObject({ displayName: "Ana", neighborhood: "Noe Valley" });
    expect(out[0]?.neighborhood).toBe("");
  });

  it("never suggests someone without matching consent, the viewer, or anyone with nothing in common", async () => {
    const d = deps(
      [{ id: "me", display_name: "Me", neighborhood: null }, { id: "nope", display_name: "No consent", neighborhood: null }, { id: "x", display_name: "X", neighborhood: null }],
      [prefs("me", ["pottery"]), prefs("x", ["chess"])],
    );
    expect(await suggestPeopleFrom(d, viewer)).toEqual([]);
    expect(d.sharable).toHaveBeenCalledWith(["nope", "x"]);
  });

  it("skips the consent lookup when there are no candidates and honors the limit", async () => {
    const empty = deps([], []);
    expect(await suggestPeopleFrom(empty, viewer)).toEqual([]);
    expect(empty.sharable).not.toHaveBeenCalled();
    const many = deps(
      ["a", "b", "c", "d"].map((id) => ({ id, display_name: id, neighborhood: null })),
      ["a", "b", "c", "d"].map((id) => prefs(id, ["pottery"])),
    );
    expect(await suggestPeopleFrom(many, viewer, 2)).toHaveLength(2);
  });
});

describe("adminPublicCards", () => {
  function client(result: { data: unknown; error: { code: string } | null }) {
    const calls: [string, unknown[]][] = [];
    const chain = {
      from: (t: string) => (calls.push(["from", [t]]), chain),
      select: (...a: unknown[]) => (calls.push(["select", a]), chain),
      neq: (...a: unknown[]) => (calls.push(["neq", a]), chain),
      limit: async (...a: unknown[]) => (calls.push(["limit", a]), result),
    };
    return { chain, calls };
  }

  it("reads only public card columns, excluding the viewer", async () => {
    const { chain, calls } = client({ data: [{ id: "a", display_name: "Ana", neighborhood: null }], error: null });
    expect(await adminPublicCards(chain as never, "me", 50)).toHaveLength(1);
    expect(calls).toEqual([["from", ["profile_public_cards"]], ["select", ["id, display_name, neighborhood"]], ["neq", ["id", "me"]], ["limit", [50]]]);
  });

  it("raises INTERNAL on a database error", async () => {
    const { chain } = client({ data: null, error: { code: "42501" } });
    await expect(adminPublicCards(chain as never, "me", 50)).rejects.toMatchObject({ code: "INTERNAL" });
  });
});
