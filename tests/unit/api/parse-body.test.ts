import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApiError, parseBody, parseQuery, zodIssues } from '@/lib/api';

const schema = z.object({ name: z.string().min(1), nested: z.object({ count: z.number().int() }) });

function jsonRequest(body: unknown): Request {
  return new Request('http://test/api', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
}

describe('parseBody', () => {
  it('returns the parsed body when valid', async () => {
    await expect(parseBody(schema, jsonRequest({ name: 'a', nested: { count: 1 } }))).resolves.toEqual({ name: 'a', nested: { count: 1 } });
  });

  it('throws VALIDATION with dotted field paths when invalid', async () => {
    const promise = parseBody(schema, jsonRequest({ name: '', nested: { count: 1.5 } }));
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    const error = (await promise.catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe('VALIDATION');
    expect(error.status).toBe(400);
    const paths = (error.details as Array<{ path: string }>).map((issue) => issue.path);
    expect(paths).toEqual(expect.arrayContaining(['name', 'nested.count']));
  });

  it('throws VALIDATION when the body is not JSON', async () => {
    const req = new Request('http://test/api', { method: 'POST', body: '{not json' });
    const error = (await parseBody(schema, req).catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe('VALIDATION');
    expect(error.message).toMatch(/JSON/);
  });
});

describe('parseQuery', () => {
  const query = z.object({ page: z.coerce.number().int().min(1).default(1), q: z.string().optional() });

  it('coerces and defaults search params', () => {
    expect(parseQuery(query, 'http://test/api?q=hi')).toEqual({ page: 1, q: 'hi' });
    expect(parseQuery(query, new URL('http://test/api?page=3'))).toEqual({ page: 3 });
  });

  it('throws VALIDATION with the offending param path', () => {
    expect(() => parseQuery(query, 'http://test/api?page=0')).toThrowError(ApiError);
    try {
      parseQuery(query, 'http://test/api?page=abc');
    } catch (error) {
      expect((error as ApiError).details).toEqual([expect.objectContaining({ path: 'page' })]);
    }
  });
});

describe('zodIssues', () => {
  it('flattens issues to path + message', () => {
    const result = z.object({ a: z.object({ b: z.string() }) }).safeParse({ a: { b: 1 } });
    expect(result.success).toBe(false);
    if (!result.success) expect(zodIssues(result.error)).toEqual([{ path: 'a.b', message: expect.any(String) }]);
  });
});
