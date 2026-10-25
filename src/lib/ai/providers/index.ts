import { ApiError } from '@/lib/api/errors';
import { serverEnv } from '@/lib/env';
import { createAnthropicProvider } from './anthropic';
import { createLlamaProvider } from './llama';
import { createMuseProvider } from './muse';
import type { AiProvider, AiProviderId } from './types';

export type {
  AiProvider,
  AiProviderId,
  AiRequest,
  AiResponse,
  AiJsonSchema,
  AiMessage,
  AiErrorDetails,
} from './types';
export { createLlamaProvider, LLAMA_DEFAULT_BASE_URL } from './llama';
export { createMuseProvider, MUSE_DEFAULT_BASE_URL } from './muse';
export { createAnthropicProvider } from './anthropic';
export { createOpenAiCompatProvider } from './openai-compat';

const PROVIDER_IDS: readonly AiProviderId[] = ['anthropic', 'llama', 'muse'];

/** Env var holding each provider's credential, for error messages and auto-detection. */
const KEY_ENV: Record<AiProviderId, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  llama: 'LLAMA_API_KEY',
  muse: 'META_API_KEY',
};

let override: AiProvider | null = null;
/** Test seam: force a provider regardless of the environment. Pass `null` to restore. */
export function setProviderOverride(next: AiProvider | null): void {
  override = next;
}

function missingKey(id: AiProviderId): ApiError {
  return new ApiError(
    'AI_UNAVAILABLE',
    `AI_PROVIDER is "${id}" but ${KEY_ENV[id]} is not set (use MOCK_AI=1 for offline runs)`,
    503,
  );
}

function build(id: AiProviderId): AiProvider {
  if (id === 'muse') {
    const apiKey = serverEnv.metaApiKey;
    if (!apiKey) throw missingKey('muse');
    return createMuseProvider({ apiKey, baseUrl: serverEnv.museBaseUrl });
  }
  if (id === 'llama') {
    const apiKey = serverEnv.llamaApiKey;
    if (!apiKey) throw missingKey('llama');
    return createLlamaProvider({ apiKey, baseUrl: serverEnv.llamaBaseUrl });
  }
  if (!serverEnv.anthropicApiKey) throw missingKey('anthropic');
  return createAnthropicProvider();
}

/**
 * The provider for this process. `AI_PROVIDER` decides when set; otherwise the first vendor with
 * a key wins, Muse first, then Llama, then Anthropic -- so dropping a key into the environment
 * is enough to switch the app over. Callers only reach this when `MOCK_AI` is off.
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

  if (serverEnv.metaApiKey) return build('muse');
  if (serverEnv.llamaApiKey) return build('llama');
  if (serverEnv.anthropicApiKey) return build('anthropic');
  throw new ApiError(
    'AI_UNAVAILABLE',
    `No AI credential configured: set ${KEY_ENV.muse}, ${KEY_ENV.llama} or ${KEY_ENV.anthropic} (use MOCK_AI=1 for offline runs)`,
    503,
  );
}

/**
 * True for a failure that retrying cannot fix (bad credential, model not granted to the app).
 * Callers rethrow these untouched so the operator sees what to actually change.
 */
export function isFatalAiError(error: unknown): error is ApiError {
  return error instanceof ApiError && (error.details as { fatal?: boolean } | undefined)?.fatal === true;
}
