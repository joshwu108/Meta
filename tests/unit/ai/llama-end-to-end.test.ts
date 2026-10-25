import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('server-only', () => ({}));

const { generateStructured } = await import('@/lib/ai');
const { chat } = await import('@/lib/ai/chat');
const { createLlamaProvider } = await import('@/lib/ai/providers/llama');
const { setProviderOverride } = await import('@/lib/ai/providers');
const { ApiError } = await import('@/lib/api/errors');

const schema = z.object({ status: z.literal('ok'), source: z.string() });

function completion(content: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }], usage: { prompt_tokens: 3, completion_tokens: 4 } }),
  } as unknown as Response;
}

/** Install a Llama provider whose HTTP layer is a mock, then drive the real public API. */
function installLlama(fetchImpl: ReturnType<typeof vi.fn>) {
  setProviderOverride(createLlamaProvider({ apiKey: 'LLM|1|t', fetchImpl: fetchImpl as unknown as typeof fetch }));
}

describe('the AI layer driven by the Llama provider', () => {
  beforeEach(() => vi.stubEnv('MOCK_AI', '0'));
  afterEach(() => {
    vi.unstubAllEnvs();
    setProviderOverride(null);
  });

  it('generateStructured sends the prompt system text, the Zod schema and the input as JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(completion('{"status":"ok","source":"llama"}'));
    installLlama(fetchImpl);

    const result = await generateStructured({ prompt: 'core.healthcheck', input: { q: 1 }, schema, model: 'fast' });
    expect(result).toEqual({ status: 'ok', source: 'llama' });

    const body = JSON.parse(fetchImpl.mock.calls[0]![1].body as string);
    // `fast` resolves to the Llama model, not the Anthropic one.
    expect(body.model).toBe('Llama-4-Scout-17B-16E-Instruct-FP8');
    expect(body.messages[0]).toEqual({ role: 'system', content: expect.stringContaining('health check') });
    expect(body.messages[1]).toEqual({ role: 'user', content: '{"q":1}' });
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.schema.properties).toHaveProperty('status');
  });

  it('retries once with the validation error appended when the model returns the wrong shape', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(completion('{"status":"bad"}'))
      .mockResolvedValueOnce(completion('{"status":"ok","source":"retry"}'));
    installLlama(fetchImpl);

    await expect(generateStructured({ prompt: 'core.healthcheck', input: {}, schema })).resolves.toEqual({
      status: 'ok',
      source: 'retry',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const retry = JSON.parse(fetchImpl.mock.calls[1]![1].body as string);
    expect(retry.messages.at(-1).content).toMatch(/failed validation/);
  });

  it('surfaces the 403 model-access message through generateStructured without retrying', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: { message: 'The requested model is not available for your application.' } }),
    } as unknown as Response);
    installLlama(fetchImpl);

    const err = (await generateStructured({ prompt: 'core.healthcheck', input: {}, schema }).catch(
      (e: unknown) => e,
    )) as InstanceType<typeof ApiError>;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('AI_UNAVAILABLE');
    // The actionable reason must survive the retry loop, not be flattened into a generic message.
    expect(err.message).toMatch(/model access/i);
    // A permission failure is not retryable, so the loop must stop after the first attempt.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does not retry a bad credential either', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ title: 'Authentication Error' }),
    } as unknown as Response);
    installLlama(fetchImpl);
    const err = (await generateStructured({ prompt: 'core.healthcheck', input: {}, schema }).catch(
      (e: unknown) => e,
    )) as InstanceType<typeof ApiError>;
    expect(err.message).toMatch(/LLAMA_API_KEY/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('still retries a transient 5xx', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: { message: 'busy' } }) } as unknown as Response)
      .mockResolvedValueOnce(completion('{"status":"ok","source":"after-503"}'));
    installLlama(fetchImpl);
    await expect(generateStructured({ prompt: 'core.healthcheck', input: {}, schema })).resolves.toEqual({
      status: 'ok',
      source: 'after-503',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('chat returns the Llama text content', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(completion('Hello from Llama'));
    installLlama(fetchImpl);
    await expect(chat({ prompt: 'agent.chat', messages: [{ role: 'user', content: 'hi' }] })).resolves.toBe(
      'Hello from Llama',
    );
    const body = JSON.parse(fetchImpl.mock.calls[0]![1].body as string);
    expect(body.response_format).toBeUndefined();
    expect(body.messages.at(-1)).toEqual({ role: 'user', content: 'hi' });
  });

  it('chat preserves the actionable Llama error instead of flattening it', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ title: 'Authentication Error' }),
    } as unknown as Response);
    installLlama(fetchImpl);
    const err = (await chat({ prompt: 'agent.chat', messages: [] }).catch((e: unknown) => e)) as InstanceType<
      typeof ApiError
    >;
    expect(err.code).toBe('AI_UNAVAILABLE');
    expect(err.message).toMatch(/LLAMA_API_KEY/);
  });

  it('MOCK_AI still wins over a configured provider', async () => {
    vi.stubEnv('MOCK_AI', '1');
    const fetchImpl = vi.fn();
    installLlama(fetchImpl);
    await expect(generateStructured({ prompt: 'core.healthcheck', input: {}, schema })).resolves.toEqual({
      status: 'ok',
      source: 'fixture',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
