import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AVAILABILITY_SLOT, GROUP_SIZE_PREF } from "@/shared/enums";
import { phraseToSlots } from "@/features/agent/server/time-slots";

const dir = "tests/evals/agent";
const cases = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(`${dir}/${f}`, "utf8")));

describe("agent eval set", () => {
  it("has 10 well-formed transcripts including traps", () => {
    expect(cases).toHaveLength(10);
    expect(cases.filter((c) => c.id.includes("trap")).length).toBeGreaterThanOrEqual(3);
    for (const c of cases) {
      expect(c.expected.availabilitySlots.every((s: string) => (AVAILABILITY_SLOT as readonly string[]).includes(s))).toBe(true);
      expect(c.expected.groupSizePref === null || (GROUP_SIZE_PREF as readonly string[]).includes(c.expected.groupSizePref)).toBe(true);
    }
  });

  it("the deterministic phrase mapper agrees with every expected slot set", () => {
    for (const c of cases) {
      const text = c.transcript.map((m: { content: string }) => m.content).join(" ");
      expect([c.id, phraseToSlots(text)]).toEqual([c.id, c.expected.availabilitySlots]);
    }
  });
});
