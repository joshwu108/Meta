import { LLAMA_MODELS } from '../models';
import { createOpenAiCompatProvider } from './openai-compat';
import type { AiProvider } from './types';

/** Meta's Llama API, OpenAI-compatible surface (llama.developer.meta.com). */
export const LLAMA_DEFAULT_BASE_URL = 'https://api.llama.com/compat/v1';

export type LlamaProviderOptions = {
  apiKey: string;
  /** Override for a gateway, a proxy, or a local OpenAI-compatible server. */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

export function createLlamaProvider(options: LlamaProviderOptions): AiProvider {
  return createOpenAiCompatProvider({
    id: 'llama',
    apiKey: options.apiKey,
    baseUrl: options.baseUrl ?? LLAMA_DEFAULT_BASE_URL,
    models: LLAMA_MODELS,
    label: 'Llama API',
    keyEnvVar: 'LLAMA_API_KEY',
    keyHint: 'It must be the full "LLM|<app-id>|<token>" value, pipes included.',
    dashboard: 'Llama dashboard',
    fetchImpl: options.fetchImpl,
  });
}
