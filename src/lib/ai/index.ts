/**
 * Model wrapper (specs §4). All AI calls in the app go through this module.
 * - `generateStructured` forces JSON from a Zod schema (tool call on Anthropic, `response_format` on Llama)
 * - `chat` returns free text
 * - `MOCK_AI=1` serves fixtures from `src/lib/ai/fixtures/<promptId>.json`
 * - `AI_PROVIDER` picks the vendor; unset means "first key present", Llama first
 */
export { generateStructured } from './generate-structured';
export { chat } from './chat';
export { MODELS, LLAMA_MODELS, type ModelTier } from './models';
export { PROMPT_IDS, PROMPTS, isPromptId, type PromptId, type PromptDefinition } from './prompts';
export { resolveProvider, setProviderOverride, type AiProvider, type AiProviderId } from './providers';
export type { ChatMessage, ChatOptions, GenerateStructuredOptions, StructuredImage } from './types';
