import { ApiError } from '@/lib/api/errors';
import { serverEnv } from '@/lib/env';
import { createAnthropicProvider } from './anthropic';
import { createLlamaProvider } from './llama';
import type { AiProvider, AiProviderId } from './types';

export type { AiProvider, AiProviderId, AiRequest, AiResponse, AiJsonSchema, AiMessage } from './types';
export { createLlamaProvider, LLAMA_DEFAULT_BASE_URL } from './llama';
export { createAnthropicProvider } from './anthropic';

const PROVIDER_IDS: readonly AiProviderId[] = ['anthropic', 'llama'];

let override: AiProvider | null = null;
/** Test seam: force a provider regardless of the environment. Pass `null` to restore. */
export function setProviderOverride(next: AiProvider | null): void {
  override = next;
}

function missingKey(id: AiProviderId): ApiError {
  const envVar = id === 'llama' ? 'LLAMA_API_KEY' : 'ANTHROPIC_API_KEY';
  return new ApiError(
    'AI_UNAVAILABLE',
    `AI_PROVIDER is "${id}" but ${envVar} is not set (use MOCK_AI=1 for offline runs)`,
    503,
  );
}

function build(id: AiProviderId): AiProvider {
  if (id === 'llama') {
    const apiKey = serverEnv.llamaApiKey;
    if (!apiKey) throw missingKey('llama');
    return createLlamaProvider({ apiKey, baseUrl: serverEnv.llamaBaseUrl });
  }
  if (!serverEnv.anthropicApiKey) throw missingKey('anthropic');
  return createAnthropicProvider();
}

/**
 * The provider for this process. `AI_PROVIDER` decides when set; otherwise the first vendor
 * with a key wins, Llama first, so dropping `LLAMA_API_KEY` into the environment is enough to
 * switch the app over. Callers only reach this when `MOCK_AI` is off.
 */
export function resolveProvider(): AiProvider {
  if (override) return override;

  const configured = (process.env.AI_PROVIDER ?? '').trim().toLowerCase();
  if (configured) {
    if (!PROVIDER_IDS.includes(configured as AiProviderId)) {
      throw new ApiError(
        'AI_UNAVAILABLE',
        `AI_PROVIDER must be one of ${PROVIDER_IDS.join(', ')} (got "${configured}")`,
        503,
      );
    }
    return build(configured as AiProviderId);
  }

  if (serverEnv.llamaApiKey) return build('llama');
  if (serverEnv.anthropicApiKey) return build('anthropic');
  throw new ApiError(
    'AI_UNAVAILABLE',
    'No AI credential configured: set LLAMA_API_KEY or ANTHROPIC_API_KEY (use MOCK_AI=1 for offline runs)',
    503,
  );
}
