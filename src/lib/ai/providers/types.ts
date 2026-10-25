import type { ModelTier } from '../models';

/** Vendors `src/lib/ai` can talk to. Selected by `AI_PROVIDER` (see ./index.ts). */
export type AiProviderId = 'anthropic' | 'llama';

/** A JSON Schema the model must conform to, plus the name the vendor labels it with. */
export type AiJsonSchema = {
  name: string;
  schema: Record<string, unknown>;
};

export type AiMessage = { role: 'user' | 'assistant'; content: string };

/**
 * One vendor-neutral completion request. `json` switches the call into structured mode: the
 * provider is responsible for making the model emit JSON matching the schema, by whatever
 * mechanism it offers (tool forcing on Anthropic, `response_format` on Llama).
 */
export type AiRequest = {
  model: string;
  system?: string;
  messages: readonly AiMessage[];
  maxTokens: number;
  json?: AiJsonSchema;
};

export type AiResponse = {
  /** Concatenated text content. Empty for a structured response. */
  text: string;
  /** Parsed JSON, present only when `json` was requested. */
  data?: unknown;
  usage: { inputTokens: number; outputTokens: number };
};

export type AiProvider = {
  readonly id: AiProviderId;
  /** This vendor's model id for a tier. */
  modelFor: (tier: ModelTier) => string;
  complete: (req: AiRequest) => Promise<AiResponse>;
};
