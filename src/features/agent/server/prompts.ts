/**
 * Agent prompt text now lives in 01's registry slot (`src/lib/ai/prompts/agent.ts`) so
 * `generateStructured` picks it up by prompt id. Re-exported here for the eval runner and tests.
 */
export { AGENT_PROMPTS as AGENT_PROMPT_DEFINITIONS, CHAT_SYSTEM, EXPLAIN_SYSTEM, EXTRACT_SYSTEM, FOLLOW_UP_SYSTEM } from "@/lib/ai/prompts/agent";
