import type { ModelTier } from '../models';

/** Vendors `src/lib/ai` can talk to. Selected by `AI_PROVIDER` (see ./index.ts). */
export type AiProviderId = 'anthropic' | 'llama' | 'muse';

/** A JSON Schema the model must conform to, plus the name the vendor labels it with. */
export type AiJsonSchema = {
  name: string;
  schema: Record<string, unknown>;
};

/**
 * A piece of a message. Text-only messages stay a plain string; a message carrying images becomes
 * a list of parts, images first, so a provider can map them to its own block format.
 */
export type AiContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mediaType: 'image/jpeg' | 'image/png' | 'image/webp'; data: string };

export type AiMessage = { role: 'user' | 'assistant'; content: string | readonly AiContentPart[] };

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

/**
 * `details` a provider attaches to an `AI_UNAVAILABLE` error. `fatal` marks a failure that
 * retrying cannot fix -- a bad credential or a model the app is not entitled to -- so callers
 * stop immediately and keep the actionable message instead of a generic one.
 */
export type AiErrorDetails = {
  status?: number;
  reason?: string;
  model?: string;
  fatal?: boolean;
};
