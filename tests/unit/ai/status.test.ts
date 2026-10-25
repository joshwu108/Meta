import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { aiStatus } = await import('@/lib/ai/status');
const { setProviderOverride } = await import('@/lib/ai/providers');

describe('aiStatus', () => {
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

  it('reports mocked with the reason when MOCK_AI is on', () => {
    vi.stubEnv('MOCK_AI', '1');
    const status = aiStatus();
    expect(status.mocked).toBe(true);
    expect(status.provider).toBeNull();
    expect(status.reason).toMatch(/MOCK_AI/);
  });

  it('reports the live provider and its models when a key is configured', () => {
    vi.stubEnv('MOCK_AI', '0');
    vi.stubEnv('LLAMA_API_KEY', 'LLM|1|t');
    const status = aiStatus();
    expect(status).toMatchObject({
      mocked: false,
      provider: 'llama',
      models: { smart: expect.stringContaining('Llama-'), fast: expect.stringContaining('Llama-') },
    });
    expect(status.reason).toBeUndefined();
  });

  it('reports why no provider is usable instead of throwing', () => {
    vi.stubEnv('MOCK_AI', '0');
    const status = aiStatus();
    expect(status.mocked).toBe(false);
    expect(status.provider).toBeNull();
    expect(status.reason).toMatch(/LLAMA_API_KEY/);
  });

  it('never reveals the key itself', () => {
    vi.stubEnv('MOCK_AI', '0');
    vi.stubEnv('LLAMA_API_KEY', 'LLM|1|super-secret-token');
    expect(JSON.stringify(aiStatus())).not.toContain('super-secret-token');
  });
});
