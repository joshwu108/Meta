/** Model tiers (README §1). */
export const MODELS = {
  smart: 'claude-sonnet-5-5',
  fast: 'claude-haiku-5-5',
} as const;
export type ModelTier = keyof typeof MODELS;
export type ModelId = (typeof MODELS)[ModelTier];

export const DEFAULT_MAX_TOKENS = 4096;
