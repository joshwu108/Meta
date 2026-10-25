import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { ApiError } from '@/lib/api/errors';
import { serverEnv } from '@/lib/env';
import { log } from '@/lib/log';
import { fixtureToText, loadFixture } from './mock';
import { maxTokensFor } from './models';
import { PROMPTS } from './prompts';
import { createAnthropicProvider, resolveProvider, setProviderOverride } from './providers';
import type { ChatOptions } from './types';

type ChatCall = (params: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>;

/**
 * Anthropic-shaped test seam, kept for the existing suites. Shares the one provider override
 * with `setStructuredTransport`. New tests should prefer `setProviderOverride`.
 */
export function setChatTransport(next: ChatCall | null): void {
  setProviderOverride(next ? createAnthropicProvider({ send: next }) : null);
}

/** Free-text chat completion. With `MOCK_AI=1` returns the fixture text for the prompt id. */
export async function chat(opts: ChatOptions): Promise<string> {
  const started = Date.now();
  if (serverEnv.isMockAi) {
    const text = fixtureToText(await loadFixture(opts.prompt));
    log.info('ai.chat', { prompt: opts.prompt, model: 'mock', latencyMs: Date.now() - started });
    return text;
  }
  const definition = PROMPTS[opts.prompt];
  const provider = resolveProvider();
  const model = provider.modelFor(opts.model ?? definition?.model ?? 'smart');
  try {
    const response = await provider.complete({
      model,
      maxTokens: maxTokensFor(provider.id),
      system: opts.system ?? definition?.system,
      messages: opts.messages,
    });
    log.info('ai.chat', {
      prompt: opts.prompt,
      provider: provider.id,
      model,
      latencyMs: Date.now() - started,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
    });
    return response.text;
  } catch (error) {
    log.error('ai.chat.failed', { prompt: opts.prompt, provider: provider.id, model, error });
    if (error instanceof ApiError) throw error;
    throw new ApiError('AI_UNAVAILABLE', 'The AI service is unavailable', 503);
  }
}
