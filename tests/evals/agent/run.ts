/**
 * Live prompt eval for agent.extract_preferences (needs ANTHROPIC_API_KEY, not run in CI).
 *   ANTHROPIC_API_KEY=... pnpm tsx --conditions=react-server tests/evals/agent/run.ts
 * Pass bar (spec 9): >= 9/10 cases correct on interests, slots and group size.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { ExtractedPreferencesSchema } from "../../../src/features/agent/schemas";
import { groundExtraction } from "../../../src/features/agent/server/extraction";
import { generateStructured } from "../../../src/lib/ai";

type Case = {
  id: string;
  transcript: { role: string; content: string }[];
  expected: { interests: string[]; availabilitySlots: string[]; groupSizePref: string | null; budgetMaxCents: number | null };
};

const dir = path.dirname(new URL(import.meta.url).pathname);
const cases: Case[] = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")));

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

async function main() {
  let passed = 0;
  for (const c of cases) {
    const raw = await generateStructured({
      prompt: "agent.extract_preferences",
      input: { transcript: c.transcript, currentPreferences: {} },
      schema: ExtractedPreferencesSchema,
    });
    const out = groundExtraction(raw, c.transcript.map((m) => m.content).join("\n"));
    const tags = out.interests.map((i) => i.tag);
    const ok =
      c.expected.interests.every((i) => tags.some((t) => t.includes(i))) &&
      sameSet(out.availabilitySlots, c.expected.availabilitySlots) &&
      out.groupSizePref === c.expected.groupSizePref &&
      out.budgetMaxCents === c.expected.budgetMaxCents;
    passed += ok ? 1 : 0;
    process.stdout.write(`${ok ? "PASS" : "FAIL"} ${c.id} ${ok ? "" : JSON.stringify({ tags, slots: out.availabilitySlots, size: out.groupSizePref, budget: out.budgetMaxCents })}
`);
  }
  process.stdout.write(`${passed}/${cases.length} passed (bar: 9/${cases.length})
`);
  process.exit(passed >= 9 ? 0 : 1);
}

void main();
