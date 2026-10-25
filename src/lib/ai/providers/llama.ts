import { ApiError } from '@/lib/api/errors';
import { LLAMA_MODELS } from '../models';
import type { ModelTier } from '../models';
import type { AiProvider, AiRequest, AiResponse } from './types';

/** Meta's OpenAI-compatible surface (llama.developer.meta.com). */
export const LLAMA_DEFAULT_BASE_URL = 'https://api.llama.com/compat/v1';

export type LlamaProviderOptions = {
  apiKey: string;
  /** Override for a gateway or proxy. Trailing slashes are tolerated. */
  baseUrl?: string;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
};

type CompletionEnvelope = {
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

/** Pull a human-readable reason out of either error envelope the API returns. */
function reasonOf(body: unknown): string {
  if (body && typeof body === 'object') {
    const e = (body as { error?: { message?: unknown } }).error;
    if (e && typeof e === 'object' && typeof e.message === 'string') return e.message;
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === 'string') return detail;
    const title = (body as { title?: unknown }).title;
    if (typeof title === 'string') return title;
  }
  return 'no detail';
}

/**
 * Turn a transport failure into `AI_UNAVAILABLE` with a message that says what to actually fix.
 * The key itself is never interpolated, so it cannot leak into a log or an error envelope.
 */
function toApiError(status: number, body: unknown, model: string): ApiError {
  const reason = reasonOf(body);
  if (status === 401 || status === 403) {
    const message =
      status === 401
        ? 'Llama API rejected the credential. Check LLAMA_API_KEY is the full "LLM|<app-id>|<token>" value, pipes included.'
        : `Llama API has no model access for this app: "${model}" is not enabled. Grant the model to the app in the Llama dashboard, then retry.`;
    return new ApiError('AI_UNAVAILABLE', message, 503, { status, reason, model });
  }
  return new ApiError('AI_UNAVAILABLE', 'The Llama API is unavailable', 503, { status, reason, model });
}

/** Models sometimes wrap JSON in a markdown fence even in structured mode. */
function stripFence(text: string): string {
  const fenced = /^\s*```(?:json)?\s*\n([\s\S]*?)\n?\s*```\s*$/.exec(text);
  return fenced ? fenced[1]! : text;
}

export function createLlamaProvider(options: LlamaProviderOptions): AiProvider {
  const endpoint = `${(options.baseUrl ?? LLAMA_DEFAULT_BASE_URL).replace(/\/+$/, '')}/chat/completions`;
  const doFetch = options.fetchImpl ?? fetch;

  return {
    id: 'llama',
    modelFor: (tier: ModelTier) => LLAMA_MODELS[tier],
    async complete(req: AiRequest): Promise<AiResponse> {
      const messages = [
        ...(req.system ? [{ role: 'system' as const, content: req.system }] : []),
        ...req.messages.map(({ role, content }) => ({ role, content })),
      ];
      const response = await doFetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: req.model,
          max_tokens: req.maxTokens,
          messages,
          ...(req.json ? { response_format: { type: 'json_schema', json_schema: req.json } } : {}),
        }),
      });

      if (!response.ok) {
        throw toApiError(response.status, await response.json().catch(() => null), req.model);
      }

      const envelope = (await response.json()) as CompletionEnvelope;
      const text = envelope.choices?.[0]?.message?.content ?? '';
      const usage = {
        inputTokens: envelope.usage?.prompt_tokens ?? 0,
        outputTokens: envelope.usage?.completion_tokens ?? 0,
      };

      if (!req.json) return { text, usage };

      try {
        return { text: '', data: JSON.parse(stripFence(text)) as unknown, usage };
      } catch {
        throw new ApiError('AI_UNAVAILABLE', 'Llama API returned structured output that is not valid JSON', 503, {
          model: req.model,
        });
      }
    },
  };
}
