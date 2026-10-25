import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { createMuseProvider, MUSE_DEFAULT_BASE_URL } = await import('@/lib/ai/providers/muse');
const { resolveProvider, setProviderOverride } = await import('@/lib/ai/providers');
const { maxTokensFor } = await import('@/lib/ai/models');
const { ApiError } = await import('@/lib/api/errors');

const KEY = 'LLM|1820055825900931|token-value';

function completion(content: string | null, finish = 'stop') {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content }, finish_reason: finish }],
      usage: { prompt_tokens: 13, completion_tokens: 213 },
    }),
  } as unknown as Response;
}

const errorResponse = (status: number, body: unknown) =>
  ({ ok: false, status, json: async () => body }) as unknown as Response;

const provider = (fetchImpl: ReturnType<typeof vi.fn>) =>
  createMuseProvider({ apiKey: KEY, fetchImpl: fetchImpl as unknown as typeof fetch });

describe('muse provider', () => {
  let fetchImpl: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchImpl = vi.fn();
  });

  it('targets the Meta Model API and maps tiers to muse-spark models', () => {
    const p = provider(fetchImpl);
    expect(p.id).toBe('muse');
    expect(MUSE_DEFAULT_BASE_URL).toBe('https://api.meta.ai/v1');
    expect(p.modelFor('smart')).toBe('muse-spark-1.3');
    expect(p.modelFor('fast')).toBe('muse-spark-1.1');
  });

  it('posts to api.meta.ai with a bearer key', async () => {
    fetchImpl.mockResolvedValue(completion('hi'));
    await provider(fetchImpl).complete({ model: 'muse-spark-1.3', maxTokens: 2048, messages: [{ role: 'user', content: 'yo' }] });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.meta.ai/v1/chat/completions');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: `Bearer ${KEY}` });
  });

  it('uses response_format json_schema for structured output, never a forced tool_choice', async () => {
    // Muse rejects a named tool_choice with a 400, so the request must not contain one.
    fetchImpl.mockResolvedValue(completion('{"status":"ok","source":"muse"}'));
    const schema = { type: 'object', properties: { status: { type: 'string' } } };
    const res = await provider(fetchImpl).complete({
      model: 'muse-spark-1.3',
      maxTokens: 2048,
      messages: [],
      json: { name: 'emit_result', schema },
    });
    expect(res.data).toEqual({ status: 'ok', source: 'muse' });
    const body = JSON.parse(fetchImpl.mock.calls[0]![1].body as string);
    expect(body.response_format).toEqual({ type: 'json_schema', json_schema: { name: 'emit_result', schema } });
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
  });

  it('explains an exhausted reasoning budget instead of failing on invalid JSON', async () => {
    // Muse Spark emits hidden reasoning tokens first; a small budget returns null content.
    fetchImpl.mockResolvedValue(completion(null, 'length'));
    const err = (await provider(fetchImpl)
      .complete({ model: 'muse-spark-1.3', maxTokens: 20, messages: [], json: { name: 'n', schema: {} } })
      .catch((e: unknown) => e)) as InstanceType<typeof ApiError>;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toMatch(/token limit/i);
    expect(err.message).toMatch(/AI_MAX_TOKENS/);
  });

  it('names META_API_KEY on a rejected credential and does not retry it', async () => {
    fetchImpl.mockResolvedValue(errorResponse(401, { error: { message: 'bad token' } }));
    const err = (await provider(fetchImpl)
      .complete({ model: 'muse-spark-1.3', maxTokens: 64, messages: [] })
      .catch((e: unknown) => e)) as InstanceType<typeof ApiError>;
    expect(err.message).toMatch(/META_API_KEY/);
    expect((err.details as { fatal?: boolean }).fatal).toBe(true);
  });

  it('reports an unknown model distinctly from a permission problem', async () => {
    fetchImpl.mockResolvedValue(errorResponse(404, { error: { code: 'model_not_found' } }));
    const err = (await provider(fetchImpl)
      .complete({ model: 'muse-code', maxTokens: 64, messages: [] })
      .catch((e: unknown) => e)) as InstanceType<typeof ApiError>;
    expect(err.message).toMatch(/does not have a model called "muse-code"/);
  });

  it('never leaks the key in an error', async () => {
    fetchImpl.mockResolvedValue(errorResponse(500, { error: { message: 'boom' } }));
    const err = (await provider(fetchImpl)
      .complete({ model: 'm', maxTokens: 64, messages: [] })
      .catch((e: unknown) => e)) as Error;
    expect(err.message).not.toContain('token-value');
  });
});

describe('muse in provider resolution and token budget', () => {
  beforeEach(() => {
    setProviderOverride(null);
    vi.stubEnv('AI_PROVIDER', '');
    vi.stubEnv('META_API_KEY', '');
    vi.stubEnv('LLAMA_API_KEY', '');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('AI_MAX_TOKENS', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    setProviderOverride(null);
  });

  it('is selected explicitly by AI_PROVIDER=muse', () => {
    vi.stubEnv('AI_PROVIDER', 'muse');
    vi.stubEnv('META_API_KEY', KEY);
    expect(resolveProvider().id).toBe('muse');
  });

  it('wins auto-detection over a llama key', () => {
    vi.stubEnv('META_API_KEY', KEY);
    vi.stubEnv('LLAMA_API_KEY', 'LLM|9|other');
    expect(resolveProvider().id).toBe('muse');
  });

  it('names META_API_KEY when muse is selected without a key', () => {
    vi.stubEnv('AI_PROVIDER', 'muse');
    const err = (() => {
      try {
        resolveProvider();
        return null;
      } catch (e: unknown) {
        return e;
      }
    })() as InstanceType<typeof ApiError>;
    expect(err.message).toContain('META_API_KEY');
  });

  it('gives muse a larger budget than a non-reasoning provider, and honours AI_MAX_TOKENS', () => {
    expect(maxTokensFor('muse')).toBeGreaterThan(maxTokensFor('llama'));
    vi.stubEnv('AI_MAX_TOKENS', '999');
    expect(maxTokensFor('muse')).toBe(999);
    expect(maxTokensFor('llama')).toBe(999);
  });
});
