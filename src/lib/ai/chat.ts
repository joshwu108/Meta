import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { ApiError } from '@/lib/api/errors';
import { serverEnv } from '@/lib/env';
import { log } from '@/lib/log';
import { getAnthropic } from './client';
import { fixtureToText, loadFixture } from './mock';
import { DEFAULT_MAX_TOKENS, MODELS } from './models';
import { PROMPTS } from './prompts';
import type { ChatOptions } from './types';

type ChatCall = (params: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>;
let transport: ChatCall | null = null;
export function setChatTransport(next: ChatCall | null): void {
  transport = next;
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
  const model = MODELS[opts.model ?? definition?.model ?? 'smart'];
  const call: ChatCall = transport ?? ((params) => getAnthropic().messages.create(params));
  try {
    const response = await call({
      model,
      max_tokens: DEFAULT_MAX_TOKENS,
      system: opts.system ?? definition?.system,
      messages: opts.messages,
    });
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
    log.info('ai.chat', {
      prompt: opts.prompt,
      model,
      latencyMs: Date.now() - started,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });
    return text;
  } catch (error) {
    log.error('ai.chat.failed', { prompt: opts.prompt, model, error });
    throw new ApiError('AI_UNAVAILABLE', 'The AI service is unavailable', 503);
  }
}
