import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ApiError } from '@/lib/api/errors';
import { serverEnv } from '@/lib/env';
import { log } from '@/lib/log';
import { loadFixture } from './mock';
import { maxTokensFor } from './models';
import { PROMPTS } from './prompts';
import { createAnthropicProvider, isFatalAiError, resolveProvider, setProviderOverride } from './providers';
import type { AiMessage } from './providers';
import type { GenerateStructuredOptions } from './types';

const SCHEMA_NAME = 'emit_result';
const DEFAULT_RETRIES = 1;

type ToolCall = (params: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>;

/**
 * Anthropic-shaped test seam, kept for the existing suites. It installs an Anthropic provider
 * around `next`, so it shares the one provider override with `setChatTransport`.
 * New tests should prefer `setProviderOverride` from `./providers`.
 */
export function setStructuredTransport(next: ToolCall | null): void {
  setProviderOverride(next ? createAnthropicProvider({ send: next }) : null);
}

function describeIssues(error: unknown): string {
  if (error && typeof error === 'object' && 'issues' in error) {
    return JSON.stringify((error as { issues: unknown }).issues);
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * Ask the configured model for JSON that matches `schema`. The schema is sent as the provider's
 * native structured-output mechanism (forced tool call on Anthropic, `response_format` on Llama)
 * and the result is validated with Zod. On validation failure the call is retried once with the
 * error appended; after that `AI_UNAVAILABLE` is thrown.
 * With `MOCK_AI=1` the fixture for the prompt id is returned (still validated).
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
  const provider = resolveProvider();
  const model = provider.modelFor(tier);
  const schema = zodToJsonSchema(opts.schema, { $refStrategy: 'none' }) as Record<string, unknown>;
  const retries = opts.maxRetries ?? DEFAULT_RETRIES;
  const baseMessages: AiMessage[] = [{ role: 'user', content: JSON.stringify(opts.input ?? {}) }];

  let messages = baseMessages;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await provider.complete({
        model,
        maxTokens: maxTokensFor(provider.id),
        system: definition?.system,
        messages,
        json: { name: SCHEMA_NAME, schema },
      });
      const parsed = opts.schema.safeParse(response.data);
      if (parsed.success) {
        log.info('ai.generate_structured', {
          prompt: opts.prompt,
          provider: provider.id,
          model,
          attempt,
          latencyMs: Date.now() - started,
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
        });
        return parsed.data;
      }
      lastError = parsed.error;
    } catch (error) {
      // A bad key or an un-granted model will fail identically on every retry; surface it as-is.
      if (isFatalAiError(error)) {
        log.error('ai.generate_structured.fatal', { prompt: opts.prompt, provider: provider.id, model });
        throw error;
      }
      lastError = error;
    }
    messages = [
      ...baseMessages,
      {
        role: 'user',
        content: `Your previous answer failed validation: ${describeIssues(lastError)}. Return a corrected result.`,
      },
    ];
    log.warn('ai.generate_structured.retry', { prompt: opts.prompt, provider: provider.id, model, attempt });
  }
  log.error('ai.generate_structured.failed', {
    prompt: opts.prompt,
    provider: provider.id,
    model,
    latencyMs: Date.now() - started,
  });
  throw new ApiError('AI_UNAVAILABLE', 'The AI service returned an unusable answer', 503);
}
