import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ZodSchema } from "zod";
import {
  ChatModelOutputSchema,
  ExplainOutputSchema,
  ExtractedPreferencesSchema,
  FollowUpSuggestionSchema,
} from "@/features/agent/schemas";
import { AGENT_PROMPTS } from "@/features/agent/server/prompts";
import { generateStructured } from "@/features/agent/server/stubs";

const SCHEMAS: Record<(typeof AGENT_PROMPTS)[number], ZodSchema> = {
  "agent.extract_preferences": ExtractedPreferencesSchema,
  "agent.chat": ChatModelOutputSchema,
  "agent.explain_recommendation": ExplainOutputSchema,
  "agent.follow_up_suggestion": FollowUpSuggestionSchema,
};

function outputs(prompt: string): unknown[] {
  const raw = JSON.parse(readFileSync(path.join("src/lib/ai/fixtures", `${prompt}.json`), "utf8"));
  return Array.isArray(raw.cases) ? [...raw.cases.map((c: { output: unknown }) => c.output), raw.default] : [raw];
}

describe("MOCK_AI fixtures", () => {
  it.each(AGENT_PROMPTS)("%s: every output matches its schema", (prompt) => {
    for (const out of outputs(prompt)) expect(SCHEMAS[prompt].safeParse(out).success).toBe(true);
  });

  it("selects a case by substring of the input", async () => {
    const out = await generateStructured({
      prompt: "agent.extract_preferences",
      input: { transcript: [{ role: "user", content: "I love Board Games" }] },
      schema: ExtractedPreferencesSchema,
    });
    expect(out.interests[0].tag).toBe("board-games");
  });

  it("falls back to the default output", async () => {
    const out = await generateStructured({
      prompt: "agent.extract_preferences",
      input: { transcript: [{ role: "user", content: "hello" }] },
      schema: ExtractedPreferencesSchema,
    });
    expect(out.followUpQuestion).not.toBeNull();
  });
});
