import { describe, expect, it } from "vitest";
import { matchNeighborhood } from "@/features/agent/components/labels";

describe("matchNeighborhood", () => {
  it.each([
    ["Mission District", "Mission District"],
    ["mission", "Mission District"],
    ["  castro ", "Castro"],
    ["haight", "Haight-Ashbury"],
    ["soma", "SoMa"],
  ])("%s → %s", (input, name) => {
    expect(matchNeighborhood(input)?.name).toBe(name);
  });

  it.each(["", "  ", "mi", "Atlantis", "n"])("returns null for %j", (input) => {
    expect(matchNeighborhood(input)).toBeNull();
  });

  it("returns null when a prefix matches several neighborhoods", () => {
    expect(matchNeighborhood("no")).toBeNull();
    expect(matchNeighborhood("Nob")).toMatchObject({ name: "Nob Hill" });
  });
});
