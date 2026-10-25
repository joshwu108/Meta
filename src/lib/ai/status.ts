import 'server-only';
import { resolveProvider } from './providers';
import type { AiProviderId } from './providers';
import { serverEnv } from '@/lib/env';
import type { ModelTier } from './models';

/**
 * Whether AI replies are real or fixtures, for the health endpoint. Carries no credential --
 * only the provider id, the public model ids, and a reason when nothing live is usable.
 */
export type AiStatus = {
  /** true = replies come from src/lib/ai/fixtures, not from a model. */
  mocked: boolean;
  provider: AiProviderId | null;
  models: Record<ModelTier, string> | null;
  /** Present when replies are not coming from a live model, saying what to change. */
  reason?: string;
};

export function aiStatus(): AiStatus {
  if (serverEnv.isMockAi) {
    return {
      mocked: true,
      provider: null,
      models: null,
      reason: 'MOCK_AI is on: replies come from src/lib/ai/fixtures. Set MOCK_AI=0 for live calls.',
    };
  }
  try {
    const provider = resolveProvider();
    return {
      mocked: false,
      provider: provider.id,
      models: { smart: provider.modelFor('smart'), fast: provider.modelFor('fast') },
    };
  } catch (error) {
    return {
      mocked: false,
      provider: null,
      models: null,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
