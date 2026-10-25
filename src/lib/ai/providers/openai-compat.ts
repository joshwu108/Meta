import { ApiError } from '@/lib/api/errors';
import type { ModelTier } from '../models';
import type { AiMessage, AiProvider, AiProviderId, AiRequest, AiResponse } from './types';

/**
 * Shared transport for vendors that implement the OpenAI Chat Completions shape. Both of Meta's
 * APIs do: the Llama API (`api.llama.com/compat/v1`) and the Meta Model API (`api.meta.ai/v1`,
 * which serves the Muse models). Structured output uses `response_format: json_schema` rather
 * than a forced tool call -- Muse rejects a named `tool_choice`, and `response_format` is the
 * mechanism both support.
 */
export type OpenAiCompatOptions = {
  id: AiProviderId;
  apiKey: string;
  baseUrl: string;
  models: Record<ModelTier, string>;
  /** Vendor name used in error messages, e.g. "Meta Model API". */
  label: string;
  /** Env var quoted when the credential is rejected. */
  keyEnvVar: string;
  /** Extra hint appended to a 401 message, e.g. the expected key format. */
  keyHint?: string;
  /** Where an operator grants model access, quoted in a 403 message. */
  dashboard: string;
  fetchImpl?: typeof fetch;
};

/**
 * Images reach this transport only if a caller sends them to a provider that cannot take them.
 * Vision on the Chat Completions shape needs a vendor-specific image encoding that neither Meta
 * API is wired for here, so this refuses rather than silently dropping the pictures and answering
 * from the text alone — a wrong answer is worse than a clear failure.
 */
function toText(content: AiMessage['content'], label: string): string {
  if (typeof content === 'string') return content;
  if (content.some((part) => part.type === 'image')) {
    throw new ApiError('AI_UNAVAILABLE', `${label} cannot take images; use AI_PROVIDER=anthropic for this call`, 503, {
      fatal: true,
    });
  }
  return content.map((part) => (part.type === 'text' ? part.text : '')).join('');
}

type CompletionEnvelope = {
  choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

function reasonOf(body: unknown): string {
  if (body && typeof body === 'object') {
    const e = (body as { error?: { message?: unknown } }).error;
    if (e && typeof e === 'object' && typeof e.message === 'string') return e.message;
    for (const key of ['detail', 'title'] as const) {
      const v = (body as Record<string, unknown>)[key];
      if (typeof v === 'string') return v;
    }
  }
  return 'no detail';
}

/** Models sometimes wrap JSON in a markdown fence even in structured mode. */
function stripFence(text: string): string {
  const fenced = /^\s*```(?:json)?\s*\n([\s\S]*?)\n?\s*```\s*$/.exec(text);
  return fenced ? fenced[1]! : text;
}

export function createOpenAiCompatProvider(o: OpenAiCompatOptions): AiProvider {
  const endpoint = `${o.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const doFetch = o.fetchImpl ?? fetch;

  /** The key is never interpolated, so it cannot leak into a log or an error envelope. */
  const toApiError = (status: number, body: unknown, model: string): ApiError => {
    const reason = reasonOf(body);
    if (status === 401) {
      const hint = o.keyHint ? ` ${o.keyHint}` : '';
      return new ApiError(
        'AI_UNAVAILABLE',
        `${o.label} rejected the credential. Check ${o.keyEnvVar}.${hint}`,
        503,
        { status, reason, model, fatal: true },
      );
    }
    if (status === 403) {
      return new ApiError(
        'AI_UNAVAILABLE',
        `${o.label} has no model access for this app: "${model}" is not enabled. Grant the model to the app in the ${o.dashboard}, then retry.`,
        503,
        { status, reason, model, fatal: true },
      );
    }
    if (status === 404) {
      return new ApiError('AI_UNAVAILABLE', `${o.label} does not have a model called "${model}"`, 503, {
        status,
        reason,
        model,
        fatal: true,
      });
    }
    return new ApiError('AI_UNAVAILABLE', `The ${o.label} is unavailable`, 503, { status, reason, model });
  };

  return {
    id: o.id,
    modelFor: (tier: ModelTier) => o.models[tier],
    async complete(req: AiRequest): Promise<AiResponse> {
      const messages = [
        ...(req.system ? [{ role: 'system' as const, content: req.system }] : []),
        ...req.messages.map(({ role, content }) => ({ role, content: toText(content, o.label) })),
      ];
      const response = await doFetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${o.apiKey}`, 'Content-Type': 'application/json' },
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
      const choice = envelope.choices?.[0];
      const text = choice?.message?.content ?? '';
      const usage = {
        inputTokens: envelope.usage?.prompt_tokens ?? 0,
        outputTokens: envelope.usage?.completion_tokens ?? 0,
      };

      /**
       * Reasoning models spend their budget on hidden reasoning tokens before emitting any
       * content, so an exhausted budget returns `content: null` with `finish_reason: "length"`.
       * Say that plainly instead of failing later on "not valid JSON".
       */
      if (choice?.finish_reason === 'length' && text.length === 0) {
        throw new ApiError(
          'AI_UNAVAILABLE',
          `${o.label} hit the token limit before replying (reasoning tokens consumed the budget). Raise AI_MAX_TOKENS for "${req.model}".`,
          503,
          { status: 200, reason: 'finish_reason=length with empty content', model: req.model },
        );
      }

      if (!req.json) return { text, usage };

      try {
        return { text: '', data: JSON.parse(stripFence(text)) as unknown, usage };
      } catch {
        throw new ApiError('AI_UNAVAILABLE', `${o.label} returned structured output that is not valid JSON`, 503, {
          model: req.model,
        });
      }
    },
  };
}
