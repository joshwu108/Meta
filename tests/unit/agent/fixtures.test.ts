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
import { AGENT_PROMPT_DEFINITIONS } from "@/features/agent/server/prompts";
import { generateStructured } from "./mock-ai";

const AGENT_PROMPTS = Object.keys(AGENT_PROMPT_DEFINITIONS) as AgentPrompt[];

type AgentPrompt = "agent.extract_preferences" | "agent.chat" | "agent.explain_recommendation" | "agent.follow_up_suggestion";

const SCHEMAS: Record<AgentPrompt, ZodSchema> = {
  "agent.extract_preferences": ExtractedPreferencesSchema,
  "agent.chat": ChatModelOutputSchema,
  "agent.explain_recommendation": ExplainOutputSchema,
  "agent.follow_up_suggestion": FollowUpSuggestionSchema,
};

function outputs(prompt: string): unknown[] {
  const raw = JSON.parse(readFileSync(path.join("src/lib/ai/fixtures", `${prompt}.json`), "utf8"));
  const { cases, ...fallback } = raw;
  return [fallback, ...(Array.isArray(cases) ? cases.map((c: { output: unknown }) => c.output) : [])];
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
    expect(out.interests[0]!.tag).toBe("board-games");
  });

  it("returns the top-level default (Scene 1) when no case matches", async () => {
    const out = await generateStructured({
      prompt: "agent.extract_preferences",
      input: { transcript: [{ role: "user", content: "something else entirely" }] },
      schema: ExtractedPreferencesSchema,
    });
    expect(out.interests.map((i) => i.tag)).toEqual(["pottery", "coffee"]);
  });

  it("keeps the top level valid for 01's plain loader (cases key is ignored)", () => {
    for (const prompt of AGENT_PROMPTS) {
      const raw = JSON.parse(readFileSync(path.join("src/lib/ai/fixtures", `${prompt}.json`), "utf8"));
      expect(SCHEMAS[prompt].safeParse(raw).success).toBe(true);
    }
  });
});
