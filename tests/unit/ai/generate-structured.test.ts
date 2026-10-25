import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { PromptId } from '@/lib/ai/prompts';

vi.mock('server-only', () => ({}));

const { generateStructured } = await import('@/lib/ai');
const { setStructuredTransport } = await import('@/lib/ai/generate-structured');
const { chat } = await import('@/lib/ai/chat');
const { setChatTransport } = await import('@/lib/ai/chat');
const { ApiError } = await import('@/lib/api/errors');

const schema = z.object({ status: z.literal('ok'), source: z.string() });

function toolMessage(input: unknown) {
  return {
    id: 'msg',
    type: 'message',
    role: 'assistant',
    model: 'x',
    stop_reason: 'tool_use',
    stop_sequence: null,
    content: [{ type: 'tool_use', id: 't', name: 'emit_result', input }],
    usage: { input_tokens: 10, output_tokens: 5 },
  } as never;
}

describe('generateStructured with MOCK_AI=1', () => {
  beforeEach(() => vi.stubEnv('MOCK_AI', '1'));
  afterEach(() => vi.unstubAllEnvs());

  it('returns the validated fixture for the prompt id', async () => {
    await expect(generateStructured({ prompt: 'core.healthcheck', input: {}, schema })).resolves.toEqual({ status: 'ok', source: 'fixture' });
  });

  it('throws AI_UNAVAILABLE when the fixture does not match the schema', async () => {
    const strict = z.object({ status: z.literal('nope') });
    const error = (await generateStructured({ prompt: 'core.healthcheck', input: {}, schema: strict }).catch((e: unknown) => e)) as InstanceType<typeof ApiError>;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('AI_UNAVAILABLE');
  });

  it('throws AI_UNAVAILABLE when no fixture exists', async () => {
    // Every registered prompt ships a fixture (see prompt-registry.test.ts), so this reaches for
    // an id that was never registered rather than relying on one being left broken.
    const unregistered = 'nobody.registered_this' as PromptId;
    const error = (await generateStructured({ prompt: unregistered, input: {}, schema }).catch((e: unknown) => e)) as InstanceType<typeof ApiError>;
    expect(error.code).toBe('AI_UNAVAILABLE');
    expect(error.message).toContain('nobody.registered_this');
  });

  it('chat() returns fixture text', async () => {
    await expect(chat({ prompt: 'core.healthcheck', messages: [{ role: 'user', content: 'hi' }] })).resolves.toContain('"status":"ok"');
  });
});

describe('generateStructured against the model', () => {
  beforeEach(() => vi.stubEnv('MOCK_AI', '0'));
  afterEach(() => {
    vi.unstubAllEnvs();
    setStructuredTransport(null);
    setChatTransport(null);
  });

  it('forces the tool and returns the parsed input on first success', async () => {
    const transport = vi.fn().mockResolvedValue(toolMessage({ status: 'ok', source: 'model' }));
    setStructuredTransport(transport);
    const result = await generateStructured({ prompt: 'core.healthcheck', input: { q: 1 }, schema, model: 'fast' });
    expect(result).toEqual({ status: 'ok', source: 'model' });
    expect(transport).toHaveBeenCalledTimes(1);
    const params = transport.mock.calls[0]![0];
    expect(params.model).toBe('claude-haiku-5-5');
    expect(params.tool_choice).toEqual({ type: 'tool', name: 'emit_result' });
    expect(params.tools[0].input_schema.properties).toHaveProperty('status');
    expect(params.messages[0].content).toBe('{"q":1}');
  });

  it('retries once with the validation error appended, then succeeds', async () => {
    const transport = vi.fn().mockResolvedValueOnce(toolMessage({ status: 'bad' })).mockResolvedValueOnce(toolMessage({ status: 'ok', source: 'retry' }));
    setStructuredTransport(transport);
    await expect(generateStructured({ prompt: 'core.healthcheck', input: {}, schema })).resolves.toEqual({ status: 'ok', source: 'retry' });
    expect(transport).toHaveBeenCalledTimes(2);
    const retryMessages = transport.mock.calls[1]![0].messages;
    expect(retryMessages).toHaveLength(2);
    expect(retryMessages[1].content).toMatch(/failed validation/);
  });

  it('throws AI_UNAVAILABLE after the retry also fails', async () => {
    const transport = vi.fn().mockResolvedValue(toolMessage({ status: 'bad' }));
    setStructuredTransport(transport);
    const error = (await generateStructured({ prompt: 'core.healthcheck', input: {}, schema }).catch((e: unknown) => e)) as InstanceType<typeof ApiError>;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('AI_UNAVAILABLE');
    expect(error.status).toBe(503);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('treats transport errors as retryable and honours maxRetries', async () => {
    const transport = vi.fn().mockRejectedValue(new Error('network'));
    setStructuredTransport(transport);
    await expect(generateStructured({ prompt: 'core.healthcheck', input: {}, schema, maxRetries: 2 })).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it('chat() concatenates text blocks and maps failures to AI_UNAVAILABLE', async () => {
    setChatTransport(vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'Hel' }, { type: 'text', text: 'lo' }], usage: { input_tokens: 1, output_tokens: 1 } } as never));
    await expect(chat({ prompt: 'agent.chat', messages: [{ role: 'user', content: 'hi' }] })).resolves.toBe('Hello');
    setChatTransport(vi.fn().mockRejectedValue(new Error('down')));
    await expect(chat({ prompt: 'agent.chat', messages: [] })).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
  });
});
