import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { resolveProvider, setProviderOverride } = await import('@/lib/ai/providers');
const { ApiError } = await import('@/lib/api/errors');

describe('provider resolution', () => {
  beforeEach(() => {
    setProviderOverride(null);
    vi.stubEnv('AI_PROVIDER', '');
    vi.stubEnv('LLAMA_API_KEY', '');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    setProviderOverride(null);
  });

  it('prefers llama when AI_PROVIDER says so', () => {
    vi.stubEnv('AI_PROVIDER', 'llama');
    vi.stubEnv('LLAMA_API_KEY', 'LLM|1|t');
    expect(resolveProvider().id).toBe('llama');
  });

  it('uses anthropic when AI_PROVIDER says so, even with a llama key present', () => {
    vi.stubEnv('AI_PROVIDER', 'anthropic');
    vi.stubEnv('LLAMA_API_KEY', 'LLM|1|t');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-x');
    expect(resolveProvider().id).toBe('anthropic');
  });

  it('auto-detects llama from the key when AI_PROVIDER is unset', () => {
    vi.stubEnv('LLAMA_API_KEY', 'LLM|1|t');
    expect(resolveProvider().id).toBe('llama');
  });

  it('auto-detects llama ahead of anthropic when both keys are present', () => {
    vi.stubEnv('LLAMA_API_KEY', 'LLM|1|t');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-x');
    expect(resolveProvider().id).toBe('llama');
  });

  it('falls back to anthropic when only its key is present', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-x');
    expect(resolveProvider().id).toBe('anthropic');
  });

  it('throws AI_UNAVAILABLE naming both keys when neither is configured', () => {
    const err = (() => {
      try {
        resolveProvider();
        return null;
      } catch (e: unknown) {
        return e;
      }
    })() as InstanceType<typeof ApiError>;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('AI_UNAVAILABLE');
    expect(err.message).toContain('LLAMA_API_KEY');
    expect(err.message).toContain('MOCK_AI=1');
  });

  it('rejects an unknown AI_PROVIDER value rather than guessing', () => {
    vi.stubEnv('AI_PROVIDER', 'gpt-5');
    vi.stubEnv('LLAMA_API_KEY', 'LLM|1|t');
    expect(() => resolveProvider()).toThrowError(/AI_PROVIDER/);
  });

  it('reports the missing key for an explicitly selected provider', () => {
    vi.stubEnv('AI_PROVIDER', 'llama');
    const err = (() => {
      try {
        resolveProvider();
        return null;
      } catch (e: unknown) {
        return e;
      }
    })() as InstanceType<typeof ApiError>;
    expect(err.code).toBe('AI_UNAVAILABLE');
    expect(err.message).toContain('LLAMA_API_KEY');
  });

  it('lets a test override win over the environment', () => {
    vi.stubEnv('LLAMA_API_KEY', 'LLM|1|t');
    const stub = {
      id: 'anthropic' as const,
      modelFor: () => 'stub',
      complete: async () => ({ text: '', usage: { inputTokens: 0, outputTokens: 0 } }),
    };
    setProviderOverride(stub);
    expect(resolveProvider()).toBe(stub);
  });
});
