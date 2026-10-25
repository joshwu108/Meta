import type { ZodSchema } from 'zod';
import type { PromptId } from './prompts';
import type { ModelTier } from './models';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

/** One base64 image sent ahead of the JSON input (vision). Bytes are never logged or stored. */
export type StructuredImage = { mediaType: 'image/jpeg' | 'image/png' | 'image/webp'; data: string };

export type GenerateStructuredOptions<T> = {
  prompt: PromptId;
  /** Arbitrary JSON-serialisable input; it is sent as the user message. */
  input: unknown;
  schema: ZodSchema<T>;
  model?: ModelTier;
  /** Extra retries after the first attempt fails validation. Default 1. */
  maxRetries?: number;
  /** Optional images: the user message becomes the image blocks followed by the JSON text block. */
  images?: readonly StructuredImage[];
};

export type ChatOptions = {
  prompt: PromptId;
  messages: ChatMessage[];
  system?: string;
  model?: ModelTier;
};

export type AiUsage = { inputTokens: number; outputTokens: number };
