/**
 * Claude wrapper (specs §4). All AI calls in the app go through this module.
 * - `generateStructured` forces JSON via a tool definition built from a Zod schema
 * - `chat` returns free text
 * - `MOCK_AI=1` serves fixtures from `src/lib/ai/fixtures/<promptId>.json`
 */
export { generateStructured } from './generate-structured';
export { chat } from './chat';
export { MODELS, type ModelTier } from './models';
export { PROMPT_IDS, PROMPTS, isPromptId, type PromptId, type PromptDefinition } from './prompts';
export type { ChatMessage, ChatOptions, GenerateStructuredOptions, StructuredImage } from './types';
