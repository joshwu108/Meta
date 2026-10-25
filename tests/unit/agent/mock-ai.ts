import { readFileSync } from "node:fs";
import path from "node:path";
import type { ZodSchema } from "zod";

/**
 * Test-only replacement for `@/lib/ai`'s `generateStructured` under MOCK_AI. 01's loader returns
 * the fixture's top level; ws02 fixtures also carry `cases: [{ match, output }]` so tests can pick
 * a response by a substring of the input. Use with `vi.mock("@/lib/ai", () => mockAi)`.
 */
export function fixtureOutput(prompt: string, input: unknown): unknown {
  const file = path.join(process.cwd(), "src/lib/ai/fixtures", `${prompt}.json`);
  const { cases, ...fallback } = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  if (!Array.isArray(cases)) return fallback;
  const haystack = JSON.stringify(input).toLowerCase();
  const hit = (cases as { match: string; output: unknown }[]).find((c) => haystack.includes(c.match.toLowerCase()));
  return hit ? hit.output : fallback;
}

export async function generateStructured<T>(opts: { prompt: string; input: unknown; schema: ZodSchema<T> }): Promise<T> {
  return opts.schema.parse(fixtureOutput(opts.prompt, opts.input));
}

export const mockAi = { generateStructured };
