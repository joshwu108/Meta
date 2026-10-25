import { AGENT_PROMPTS } from './agent';
import { DEMAND_PROMPTS } from './demand';
import { EVENTS_PROMPTS } from './events';
import { GROUPS_PROMPTS } from './groups';
import { IMPORT_PROMPTS } from './import';

/**
 * Prompt registry. Every workstream appends its prompt ids here and ships a fixture at
 * `src/lib/ai/fixtures/<promptId>.json` so `MOCK_AI=1` works for it in CI.
 *
 * Naming: `<workstream-feature>.<verb_noun>`, e.g. `agent.extract_preferences`.
 */
export const PROMPT_IDS = [
  // 01 core: used by tests and the health check only
  'core.healthcheck',
  // 02 agent
  'agent.extract_preferences',
  'agent.chat',
  'agent.explain_recommendation',
  'agent.follow_up_suggestion',
  // 03 matching / groups
  'matching.explain_match',
  'groups.plan_activities',
  // 04 demand
  'demand.generate_proposal',
  'demand.revise_proposal',
  // 06 events
  'events.reconnect_followup',
  // 07 import
  'import.read_screens',
  'import.map_labels',
  'import.plan',
] as const;

export type PromptId = (typeof PROMPT_IDS)[number];

export type PromptDefinition = {
  /** System prompt sent with every call for this id. */
  system: string;
  /** Default model tier. `smart` = Sonnet, `fast` = Haiku. */
  model: 'fast' | 'smart';
};

export type PromptDefinitions = Partial<Record<PromptId, PromptDefinition>>;

/**
 * System prompts by id. Each workstream keeps its definitions in its own file under
 * `src/lib/ai/prompts/` (agent.ts, groups.ts, demand.ts, events.ts) and they are spread here, so
 * merges never collide on this file. Unregistered ids fall back to a neutral system prompt.
 */
export const PROMPTS: Partial<Record<PromptId, PromptDefinition>> = {
  'core.healthcheck': {
    system: 'You are a health check. Reply with the JSON the tool schema asks for and nothing else.',
    model: 'fast',
  },
  ...AGENT_PROMPTS,
  ...GROUPS_PROMPTS,
  ...DEMAND_PROMPTS,
  ...EVENTS_PROMPTS,
  ...IMPORT_PROMPTS,
};

export function isPromptId(value: string): value is PromptId {
  return (PROMPT_IDS as readonly string[]).includes(value);
}
