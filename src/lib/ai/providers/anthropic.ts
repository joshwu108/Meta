import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { ApiError } from '@/lib/api/errors';
import { getAnthropic } from '../client';
import { MODELS } from '../models';
import type { ModelTier } from '../models';
import type { AiMessage } from './types';
import type { AiProvider, AiRequest, AiResponse } from './types';

const TOOL_NAME = 'emit_result';

export type AnthropicProviderOptions = {
  /** Injectable transport so tests can run without the network. */
  send?: (params: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>;
};

/**
 * Anthropic implementation. Structured mode is done with a forced single-tool call, which is
 * Claude's reliable way to get schema-shaped JSON; free text reads the text blocks.
 */
/** Vendor-neutral parts to Anthropic blocks. A plain string is passed through untouched. */
function toAnthropicContent(content: AiMessage['content']): Anthropic.MessageParam['content'] {
  if (typeof content === 'string') return content;
  return content.map((part) =>
    part.type === 'text'
      ? { type: 'text' as const, text: part.text }
      : {
          type: 'image' as const,
          source: { type: 'base64' as const, media_type: part.mediaType, data: part.data },
        },
  );
}

export function createAnthropicProvider(options: AnthropicProviderOptions = {}): AiProvider {
  const send = options.send ?? ((params) => getAnthropic().messages.create(params));

  return {
    id: 'anthropic',
    modelFor: (tier: ModelTier) => MODELS[tier],
    async complete(req: AiRequest): Promise<AiResponse> {
      const response = await send({
        model: req.model,
        max_tokens: req.maxTokens,
        system: req.system,
        messages: req.messages.map(({ role, content }) => ({ role, content: toAnthropicContent(content) })),
        ...(req.json
          ? {
              tools: [
                {
                  name: TOOL_NAME,
                  description: 'Return the result in the required shape.',
                  input_schema: req.json.schema as Anthropic.Tool.InputSchema,
                },
              ],
              tool_choice: { type: 'tool' as const, name: TOOL_NAME },
            }
          : {}),
      });

      const usage = {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      };

      if (req.json) {
        const block = response.content.find((item) => item.type === 'tool_use');
        if (!block || block.type !== 'tool_use') {
          throw new ApiError('AI_UNAVAILABLE', 'Claude returned no tool_use block', 503);
        }
        return { text: '', data: block.input, usage };
      }

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');
      return { text, usage };
    },
  };
}
