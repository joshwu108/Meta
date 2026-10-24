import "server-only";
import { ExplainOutputSchema, type ExplainOutput } from "../schemas";
import type { SharablePreferences } from "@/shared/types";
import { AGENT_PROMPT_DEFINITIONS } from "./prompts";
import { generateStructured } from "./stubs";

export type ExplainTarget =
  | { kind: "person"; preferences: SharablePreferences; displayName?: string }
  | { kind: "event"; event: Record<string, unknown> }
  | { kind: "group"; group: Record<string, unknown> };

export type ExplainInput = {
  viewer: SharablePreferences;
  target: ExplainTarget;
  /** Deterministic score breakdown from the caller (03 or 06). */
  breakdown: Record<string, unknown>;
};


const MAX_EXPLANATION = 160;

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Drop highlights that do not appear in the input JSON; keep at most 3. */
export function groundHighlights(highlights: readonly string[], input: unknown): string[] {
  const haystack = normalize(JSON.stringify(input));
  return highlights
    .map((h) => h.trim())
    .filter((h) => h.length > 0 && normalize(h).length > 0 && haystack.includes(normalize(h)))
    .slice(0, 3);
}

/** Deterministic explanation used when the model is unavailable. */
export function fallbackExplanation(input: ExplainInput): ExplainOutput {
  const shared = sharedInterests(input);
  const highlights = shared.slice(0, 3);
  const explanation = highlights.length
    ? `You both like ${highlights.join(", ")}.`
    : "Matches your preferences and availability.";
  return { explanation: explanation.slice(0, MAX_EXPLANATION), highlights };
}

function sharedInterests(input: ExplainInput): string[] {
  const viewer = new Set(input.viewer.interests);
  const target = input.target;
  if (target.kind === "person") return target.preferences.interests.filter((i) => viewer.has(i));
  const text = normalize(JSON.stringify(target.kind === "event" ? target.event : target.group));
  return input.viewer.interests.filter((i) => text.includes(normalize(i)));
}

/** Full explanation with grounded highlights. Never throws on AI failure. */
export async function explainDetailed(input: ExplainInput): Promise<ExplainOutput> {
  try {
    const out = await generateStructured({
      prompt: "agent.explain_recommendation",
      input,
      schema: ExplainOutputSchema,
      system: AGENT_PROMPT_DEFINITIONS["agent.explain_recommendation"].system,
      model: "fast",
    });
    return {
      explanation: out.explanation.slice(0, MAX_EXPLANATION),
      highlights: groundHighlights(out.highlights, input),
    };
  } catch {
    return fallbackExplanation(input);
  }
}

/** README contract: short, user-facing "why". */
export async function explainRecommendation(input: ExplainInput): Promise<string> {
  return (await explainDetailed(input)).explanation;
}
