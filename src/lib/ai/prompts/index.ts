/**
 * Prompt registry. Every workstream appends its prompt ids here and ships a fixture at
 * `src/lib/ai/fixtures/<promptId>.json` so `MOCK_AI=1` works for it in CI.
 *
 * Naming: `<workstream-feature>.<verb_noun>`, e.g. `agent.extract_preferences`.
 */
import { DEMAND_PROMPTS } from './demand';

export const PROMPT_IDS = [
  // 01 core: used by tests and the health check only
  'core.healthcheck',
  // 02 agent
  'agent.extract_preferences',
  'agent.chat',
  'agent.explain_recommendation',
  // 03 matching / groups
  'matching.explain_match',
  'groups.plan_activity',
  // 04 demand
  'demand.generate_proposal',
  'demand.revise_proposal',
  // 06 events
  'events.reconnect_followup',
] as const;

export type PromptId = (typeof PROMPT_IDS)[number];

export type PromptDefinition = {
  /** System prompt sent with every call for this id. */
  system: string;
  /** Default model tier. `smart` = Sonnet, `fast` = Haiku. */
  model: 'fast' | 'smart';
};

/**
 * System prompts by id. Other workstreams register theirs here; unregistered ids fall back to
 * a neutral system prompt so a missing entry never breaks the build.
 */
export const PROMPTS: Partial<Record<PromptId, PromptDefinition>> = {
  'core.healthcheck': {
    system: 'You are a health check. Reply with the JSON the tool schema asks for and nothing else.',
    model: 'fast',
  },
  ...DEMAND_PROMPTS,
};

export function isPromptId(value: string): value is PromptId {
  return (PROMPT_IDS as readonly string[]).includes(value);
}
