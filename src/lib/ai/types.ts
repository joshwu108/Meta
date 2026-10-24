import type { ZodSchema } from 'zod';
import type { PromptId } from './prompts';
import type { ModelTier } from './models';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type GenerateStructuredOptions<T> = {
  prompt: PromptId;
  /** Arbitrary JSON-serialisable input; it is sent as the user message. */
  input: unknown;
  schema: ZodSchema<T>;
  model?: ModelTier;
  /** Extra retries after the first attempt fails validation. Default 1. */
  maxRetries?: number;
};

export type ChatOptions = {
  prompt: PromptId;
  messages: ChatMessage[];
  system?: string;
  model?: ModelTier;
};

export type AiUsage = { inputTokens: number; outputTokens: number };
