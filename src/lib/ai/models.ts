/** Model tiers (README §1). Each provider maps the tier to one of its own model ids. */
export type ModelTier = 'smart' | 'fast';

/** Anthropic ids. `smart` = Sonnet, `fast` = Haiku. */
export const MODELS = {
  smart: 'claude-sonnet-5-5',
  fast: 'claude-haiku-5-5',
} as const;
export type ModelId = (typeof MODELS)[ModelTier];

/**
 * Meta Llama API ids (llama.developer.meta.com). Maverick is the stronger instruct model,
 * Scout the cheaper one, so they line up with `smart` / `fast`. Override per deployment with
 * `LLAMA_MODEL_SMART` / `LLAMA_MODEL_FAST` when an app is provisioned for different models.
 */
export const LLAMA_MODELS: Record<ModelTier, string> = {
  smart: process.env.LLAMA_MODEL_SMART || 'Llama-4-Maverick-17B-128E-Instruct-FP8',
  fast: process.env.LLAMA_MODEL_FAST || 'Llama-4-Scout-17B-16E-Instruct-FP8',
};

export const DEFAULT_MAX_TOKENS = 4096;
