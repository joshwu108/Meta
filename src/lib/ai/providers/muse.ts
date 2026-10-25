import { MUSE_MODELS } from '../models';
import { createOpenAiCompatProvider } from './openai-compat';
import type { AiProvider } from './types';

/**
 * Meta Model API (dev.meta.ai), which serves the Muse Spark reasoning models. Same credential
 * family as the Llama API but a different service and a different model catalogue, so a key
 * entitled to Muse is not entitled to Llama and vice versa.
 */
export const MUSE_DEFAULT_BASE_URL = 'https://api.meta.ai/v1';

export type MuseProviderOptions = {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

export function createMuseProvider(options: MuseProviderOptions): AiProvider {
  return createOpenAiCompatProvider({
    id: 'muse',
    apiKey: options.apiKey,
    baseUrl: options.baseUrl ?? MUSE_DEFAULT_BASE_URL,
    models: MUSE_MODELS,
    label: 'Meta Model API',
    keyEnvVar: 'META_API_KEY',
    keyHint: 'It must be the full "LLM|<app-id>|<token>" value, pipes included.',
    dashboard: 'Meta Model API dashboard at dev.meta.ai',
    fetchImpl: options.fetchImpl,
  });
}
