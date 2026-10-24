import { describe, expect, it } from 'vitest';
import { ApiError, ERROR_CODES, ERROR_STATUS, fail, failBody, isApiError, ok, okBody } from '@/lib/api';

describe('envelope helpers', () => {
  it('okBody wraps data and omits meta when absent', () => {
    expect(okBody({ a: 1 })).toEqual({ ok: true, data: { a: 1 } });
    expect(okBody([1], { total: 1 })).toEqual({ ok: true, data: [1], meta: { total: 1 } });
  });

  it('failBody wraps code and message and omits details when absent', () => {
    expect(failBody('NOT_FOUND', 'nope')).toEqual({ ok: false, error: { code: 'NOT_FOUND', message: 'nope' } });
    expect(failBody('VALIDATION', 'bad', [{ path: 'x' }])).toEqual({
      ok: false,
      error: { code: 'VALIDATION', message: 'bad', details: [{ path: 'x' }] },
    });
  });

  it('ok() returns 200 by default and honours init', async () => {
    const res = ok({ id: 'x' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { id: 'x' } });
    expect(ok({}, undefined, { status: 201 }).status).toBe(201);
  });

  it('fail() uses the conventional status per code', async () => {
    for (const code of ERROR_CODES) {
      const res = fail(code, 'msg');
      expect(res.status).toBe(ERROR_STATUS[code]);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe(code);
    }
    expect(fail('CONFLICT', 'custom', 418).status).toBe(418);
  });

  it('ApiError carries code, status and details', () => {
    const error = new ApiError('RATE_LIMITED', 'slow down');
    expect(error.status).toBe(429);
    expect(error.name).toBe('ApiError');
    expect(isApiError(error)).toBe(true);
    expect(isApiError(new Error('x'))).toBe(false);
    expect(new ApiError('VALIDATION', 'bad', 422, { field: 'a' }).details).toEqual({ field: 'a' });
  });
});
