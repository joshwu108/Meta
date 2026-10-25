import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ApiError } from '@/lib/api/errors';
import { serverEnv } from '@/lib/env';
import { log } from '@/lib/log';
import { getAnthropic } from './client';
import { loadFixture } from './mock';
import { DEFAULT_MAX_TOKENS, MODELS } from './models';
import { PROMPTS } from './prompts';
import type { GenerateStructuredOptions } from './types';

const TOOL_NAME = 'emit_result';
const DEFAULT_RETRIES = 1;

type ToolCall = (params: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>;

/** Injectable transport so tests can run without the network. */
let transport: ToolCall | null = null;
export function setStructuredTransport(next: ToolCall | null): void {
  transport = next;
}

function describeIssues(error: unknown): string {
  if (error && typeof error === 'object' && 'issues' in error) {
    return JSON.stringify((error as { issues: unknown }).issues);
  }
  return error instanceof Error ? error.message : String(error);
}

function extractToolInput(message: Anthropic.Message): unknown {
  const block = message.content.find((item) => item.type === 'tool_use');
  if (!block || block.type !== 'tool_use') {
    throw new Error('Model returned no tool_use block');
  }
  return block.input;
}

/** JSON input as plain text, or image blocks followed by the JSON text block when images are given. */
function userContent<T>(opts: GenerateStructuredOptions<T>): Anthropic.MessageParam['content'] {
  const text = JSON.stringify(opts.input ?? {});
  if (!opts.images || opts.images.length === 0) return text;
  return [
    ...opts.images.map((image) => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: image.mediaType, data: image.data },
    })),
    { type: 'text' as const, text },
  ];
}

/**
 * Ask Claude for JSON that matches `schema`. The schema is converted to a tool definition so the
 * model is forced to emit structured output; the result is validated with Zod. On validation
 * failure the call is retried once with the error appended; after that `AI_UNAVAILABLE` is thrown.
 * With `MOCK_AI=1` the fixture for the prompt id is returned (still validated). With `images`,
 * the user message carries them ahead of the JSON and every retry resends them.
 */
export async function generateStructured<T>(opts: GenerateStructuredOptions<T>): Promise<T> {
  const started = Date.now();
  if (serverEnv.isMockAi) {
    const fixture = await loadFixture(opts.prompt);
    const parsed = opts.schema.safeParse(fixture);
    if (!parsed.success) {
      throw new ApiError('AI_UNAVAILABLE', `Fixture for "${opts.prompt}" does not match its schema`, 503, {
        issues: parsed.error.issues,
      });
    }
    log.info('ai.generate_structured', { prompt: opts.prompt, model: 'mock', latencyMs: Date.now() - started });
    return parsed.data;
  }

  const definition = PROMPTS[opts.prompt];
  const tier = opts.model ?? definition?.model ?? 'smart';
  const model = MODELS[tier];
  const call: ToolCall = transport ?? ((params) => getAnthropic().messages.create(params));
  const jsonSchema = zodToJsonSchema(opts.schema, { $refStrategy: 'none' }) as Anthropic.Tool.InputSchema;
  const retries = opts.maxRetries ?? DEFAULT_RETRIES;
  const baseMessages: Anthropic.MessageParam[] = [{ role: 'user', content: userContent(opts) }];

  let messages = baseMessages;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await call({
        model,
        max_tokens: DEFAULT_MAX_TOKENS,
        system: definition?.system,
        tools: [{ name: TOOL_NAME, description: 'Return the result in the required shape.', input_schema: jsonSchema }],
        tool_choice: { type: 'tool', name: TOOL_NAME },
        messages,
      });
      const parsed = opts.schema.safeParse(extractToolInput(response));
      if (parsed.success) {
        log.info('ai.generate_structured', {
          prompt: opts.prompt,
          model,
          attempt,
          latencyMs: Date.now() - started,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        });
        return parsed.data;
      }
      lastError = parsed.error;
    } catch (error) {
      lastError = error;
    }
    messages = [
      ...baseMessages,
      {
        role: 'user',
        content: `Your previous answer failed validation: ${describeIssues(lastError)}. Return a corrected result.`,
      },
    ];
    log.warn('ai.generate_structured.retry', { prompt: opts.prompt, model, attempt });
  }
  log.error('ai.generate_structured.failed', { prompt: opts.prompt, model, latencyMs: Date.now() - started });
  throw new ApiError('AI_UNAVAILABLE', 'The AI service returned an unusable answer', 503);
}
