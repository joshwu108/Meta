import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { serverEnv } from '@/lib/env';
import { ApiError } from '@/lib/api/errors';

let cached: Anthropic | null = null;

/** Lazily constructed Anthropic client. Throws `AI_UNAVAILABLE` when no key is configured. */
export function getAnthropic(): Anthropic {
  if (cached) return cached;
  const apiKey = serverEnv.anthropicApiKey;
  if (!apiKey) {
    throw new ApiError('AI_UNAVAILABLE', 'ANTHROPIC_API_KEY is not set (use MOCK_AI=1 for offline runs)', 503);
  }
  cached = new Anthropic({ apiKey, maxRetries: 2 });
  return cached;
}
