import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { createLlamaProvider } = await import('@/lib/ai/providers/llama');
const { ApiError } = await import('@/lib/api/errors');

const KEY = 'LLM|123|secret';

/** Minimal OpenAI-compatible success envelope as the Llama API returns it. */
function completion(content: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { role: 'assistant', content } }],
      usage: { prompt_tokens: 11, completion_tokens: 7 },
    }),
    text: async () => '',
  } as unknown as Response;
}

function errorResponse(status: number, body: unknown) {
  return {
    ok: false,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function provider(fetchImpl: typeof fetch) {
  return createLlamaProvider({ apiKey: KEY, fetchImpl });
}

describe('llama provider', () => {
  let fetchImpl: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchImpl = vi.fn();
  });

  it('is identified as llama and maps model tiers to Llama model ids', () => {
    const p = provider(fetchImpl as unknown as typeof fetch);
    expect(p.id).toBe('llama');
    expect(p.modelFor('smart')).toMatch(/^Llama-/);
    expect(p.modelFor('fast')).toMatch(/^Llama-/);
    expect(p.modelFor('smart')).not.toBe(p.modelFor('fast'));
  });

  it('posts to the OpenAI-compatible endpoint with a bearer key and the system message first', async () => {
    fetchImpl.mockResolvedValue(completion('hello there'));
    const p = provider(fetchImpl as unknown as typeof fetch);
    const res = await p.complete({
      model: 'Llama-x',
      system: 'be brief',
      maxTokens: 256,
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(res.text).toBe('hello there');
    expect(res.usage).toEqual({ inputTokens: 11, outputTokens: 7 });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.llama.com/compat/v1/chat/completions');
    expect((init as RequestInit).method).toBe('POST');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe('Llama-x');
    expect(body.max_tokens).toBe(256);
    expect(body.messages).toEqual([
      { role: 'system', content: 'be brief' },
      { role: 'user', content: 'hi' },
    ]);
    expect(body.response_format).toBeUndefined();
  });

  it('omits the system message when no system prompt is given', async () => {
    fetchImpl.mockResolvedValue(completion('x'));
    await provider(fetchImpl as unknown as typeof fetch).complete({
      model: 'Llama-x',
      maxTokens: 10,
      messages: [{ role: 'user', content: 'hi' }],
    });
    const body = JSON.parse(fetchImpl.mock.calls[0]![1].body as string);
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('requests json_schema structured output and returns the parsed object', async () => {
    fetchImpl.mockResolvedValue(completion('{"status":"ok","source":"llama"}'));
    const schema = { type: 'object', properties: { status: { type: 'string' } } };
    const res = await provider(fetchImpl as unknown as typeof fetch).complete({
      model: 'Llama-x',
      maxTokens: 64,
      messages: [{ role: 'user', content: '{}' }],
      json: { name: 'emit_result', schema },
    });

    expect(res.data).toEqual({ status: 'ok', source: 'llama' });
    const body = JSON.parse(fetchImpl.mock.calls[0]![1].body as string);
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'emit_result', schema },
    });
  });

  it('unwraps a fenced code block around structured output', async () => {
    fetchImpl.mockResolvedValue(completion('```json\n{"status":"ok"}\n```'));
    const res = await provider(fetchImpl as unknown as typeof fetch).complete({
      model: 'Llama-x',
      maxTokens: 64,
      messages: [],
      json: { name: 'emit_result', schema: { type: 'object' } },
    });
    expect(res.data).toEqual({ status: 'ok' });
  });

  it('throws AI_UNAVAILABLE when structured output is not JSON', async () => {
    fetchImpl.mockResolvedValue(completion('sorry, I cannot'));
    const err = (await provider(fetchImpl as unknown as typeof fetch)
      .complete({ model: 'm', maxTokens: 8, messages: [], json: { name: 'n', schema: {} } })
      .catch((e: unknown) => e)) as InstanceType<typeof ApiError>;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('AI_UNAVAILABLE');
  });

  it('explains a 403 permission_denied as a model-access problem on the Meta app', async () => {
    fetchImpl.mockResolvedValue(
      errorResponse(403, {
        error: { message: 'The requested model is not available for your application.', code: 'permission_denied' },
      }),
    );
    const err = (await provider(fetchImpl as unknown as typeof fetch)
      .complete({ model: 'Llama-4-Scout', maxTokens: 8, messages: [] })
      .catch((e: unknown) => e)) as InstanceType<typeof ApiError>;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('AI_UNAVAILABLE');
    expect(err.message).toMatch(/model access/i);
    expect(err.message).toContain('Llama-4-Scout');
  });

  it('explains a 401 as a bad or malformed key', async () => {
    fetchImpl.mockResolvedValue(errorResponse(401, { title: 'Authentication Error' }));
    const err = (await provider(fetchImpl as unknown as typeof fetch)
      .complete({ model: 'm', maxTokens: 8, messages: [] })
      .catch((e: unknown) => e)) as InstanceType<typeof ApiError>;
    expect(err.code).toBe('AI_UNAVAILABLE');
    expect(err.message).toMatch(/LLAMA_API_KEY/);
  });

  it('maps a 429 to AI_UNAVAILABLE', async () => {
    fetchImpl.mockResolvedValue(errorResponse(429, { error: { message: 'slow down' } }));
    await expect(
      provider(fetchImpl as unknown as typeof fetch).complete({ model: 'm', maxTokens: 8, messages: [] }),
    ).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
  });

  it('never puts the api key in the thrown message', async () => {
    fetchImpl.mockResolvedValue(errorResponse(403, { error: { message: 'nope' } }));
    const err = (await provider(fetchImpl as unknown as typeof fetch)
      .complete({ model: 'm', maxTokens: 8, messages: [] })
      .catch((e: unknown) => e)) as Error;
    expect(err.message).not.toContain('secret');
    expect(err.message).not.toContain(KEY);
  });

  it('honours a custom base url without a trailing slash problem', async () => {
    fetchImpl.mockResolvedValue(completion('ok'));
    const p = createLlamaProvider({ apiKey: KEY, baseUrl: 'https://proxy.local/compat/v1/', fetchImpl: fetchImpl as unknown as typeof fetch });
    await p.complete({ model: 'm', maxTokens: 8, messages: [] });
    expect(fetchImpl.mock.calls[0]![0]).toBe('https://proxy.local/compat/v1/chat/completions');
  });
});
