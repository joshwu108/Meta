/**
 * Typed access to environment variables. Public values are safe for the browser; server values
 * throw when read on the client or when missing, so misconfiguration fails fast.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export const publicEnv = {
  get supabaseUrl(): string {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ?? required('NEXT_PUBLIC_SUPABASE_URL');
  },
  get supabaseAnonKey(): string {
    return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? required('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  },
};

export const serverEnv = {
  get supabaseServiceRoleKey(): string {
    return required('SUPABASE_SERVICE_ROLE_KEY');
  },
  get anthropicApiKey(): string | undefined {
    return process.env.ANTHROPIC_API_KEY || undefined;
  },
  /**
   * Meta Llama API key. The real value is `LLM|<app-id>|<token>`; the pipes are part of the key,
   * so keep it quoted in `.env.local` or the shell will split it.
   */
  get llamaApiKey(): string | undefined {
    return process.env.LLAMA_API_KEY || undefined;
  },
  /** Override the Llama API origin (gateway or proxy). Defaults to Meta's OpenAI-compatible base. */
  get llamaBaseUrl(): string | undefined {
    return process.env.LLAMA_API_BASE_URL || undefined;
  },
  /**
   * Meta Model API key (dev.meta.ai), which serves the Muse models. Same `LLM|<app-id>|<token>`
   * format as a Llama key, but a separate entitlement: one does not imply the other.
   */
  get metaApiKey(): string | undefined {
    return process.env.META_API_KEY || undefined;
  },
  /** Override the Meta Model API origin. Defaults to https://api.meta.ai/v1. */
  get museBaseUrl(): string | undefined {
    return process.env.META_API_BASE_URL || undefined;
  },
  get isMockAi(): boolean {
    return process.env.MOCK_AI === '1' || process.env.MOCK_AI === 'true';
  },
  get isDemoMode(): boolean {
    return process.env.DEMO_MODE === '1' || process.env.DEMO_MODE === 'true';
  },
  get isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  },
  get minCohortSize(): number {
    const parsed = Number(process.env.MIN_COHORT_SIZE ?? 4);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 4;
  },
};
