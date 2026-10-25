/** Model tiers (README §1). Each provider maps the tier to one of its own model ids. */
export type ModelTier = 'smart' | 'fast';

/** Anthropic ids. `smart` = Sonnet, `fast` = Haiku. */
export const MODELS = {
  smart: 'claude-sonnet-5-5',
  fast: 'claude-haiku-5-5',
} as const;
export type ModelId = (typeof MODELS)[ModelTier];

/**
 * Meta Llama API ids (llama.developer.meta.com). Override per deployment with
 * `LLAMA_MODEL_SMART` / `LLAMA_MODEL_FAST`.
 */
export const LLAMA_MODELS: Record<ModelTier, string> = {
  smart: process.env.LLAMA_MODEL_SMART || 'Llama-4-Maverick-17B-128E-Instruct-FP8',
  fast: process.env.LLAMA_MODEL_FAST || 'Llama-4-Scout-17B-16E-Instruct-FP8',
};

/**
 * Meta Model API ids (dev.meta.ai) for the Muse Spark reasoning models. 1.3 is the newest, so it
 * takes `smart`; 1.1 answers fastest in practice, so it takes `fast`. Override with
 * `MUSE_MODEL_SMART` / `MUSE_MODEL_FAST`.
 */
export const MUSE_MODELS: Record<ModelTier, string> = {
  smart: process.env.MUSE_MODEL_SMART || 'muse-spark-1.3',
  fast: process.env.MUSE_MODEL_FAST || 'muse-spark-1.1',
};

export const DEFAULT_MAX_TOKENS = 4096;
/**
 * Muse Spark is a reasoning model: it spends hidden reasoning tokens before emitting content
 * (a one-word answer measured ~200-500), and an exhausted budget returns empty content. Give it
 * more headroom than a non-reasoning model.
 */
export const REASONING_MAX_TOKENS = 16384;

/** Token budget for a provider, overridable everywhere with `AI_MAX_TOKENS`. */
export function maxTokensFor(providerId: string): number {
  const override = Number(process.env.AI_MAX_TOKENS);
  if (Number.isFinite(override) && override > 0) return override;
  return providerId === 'muse' ? REASONING_MAX_TOKENS : DEFAULT_MAX_TOKENS;
}
