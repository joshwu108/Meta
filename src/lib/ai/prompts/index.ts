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
  // 03 matching / groups
  'matching.explain_match',
  'groups.plan_activities',
  // 04 demand
  'demand.generate_proposal',
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
  'groups.plan_activities': {
    model: 'smart',
    system: [
      'You suggest things for a small group of neighbors to do together.',
      'The input holds only aggregated, consented data: the request, how many members are planning, the time slots all of them are free (group.sharedSlots), the most each can spend in cents (group.budgetMaxCents), interest and category counts, a neighborhood label, and candidate events already on the calendar.',
      'Return 2 to 4 suggestions mixing candidate events (kind "existing_event" with their exact id) and new ideas (kind "new_activity", eventId null).',
      'Every slot must be one of group.sharedSlots. Keep estimatedCostCents within group.budgetMaxCents when it is set.',
      'whyItFits is one short sentence citing the shared slot and the interests most members share. Never mention or guess names or any single person\'s preferences.',
      'Set needsVenue true only for a new activity that needs a host business. Never say anything is booked or confirmed.',
    ].join(' '),
  },
};

export function isPromptId(value: string): value is PromptId {
  return (PROMPT_IDS as readonly string[]).includes(value);
}
