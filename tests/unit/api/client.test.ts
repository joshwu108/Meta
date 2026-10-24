import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiClientError} from '@/lib/api/client';
import { apiDelete, apiGet, apiPatch, apiPost, fieldErrors, isApiClientError } from '@/lib/api/client';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('api client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('unwraps ok envelopes and sends JSON bodies', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true, data: { id: 1 } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiPost<{ id: number }>('/api/x', { a: 1 })).resolves.toEqual({ id: 1 });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
    await apiGet('/api/y');
    expect((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body).toBeUndefined();
    await apiPatch('/api/z', { b: 2 });
    await apiDelete('/api/z');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('throws ApiClientError with code, message and details on error envelopes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: false, error: { code: 'VALIDATION', message: 'bad', details: [{ path: 'name', message: 'Required' }] } }, 400)));
    const error = (await apiPost('/api/x', {}).catch((e: unknown) => e)) as ApiClientError;
    expect(isApiClientError(error)).toBe(true);
    expect(error.code).toBe('VALIDATION');
    expect(error.message).toBe('bad');
    expect(fieldErrors(error.details)).toEqual({ name: 'Required' });
  });

  it('maps non-JSON responses and network failures to INTERNAL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 502 })));
    await expect(apiGet('/api/x')).rejects.toMatchObject({ code: 'INTERNAL', message: 'The server returned 502' });
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('offline');
    }));
    await expect(apiGet('/api/x')).rejects.toMatchObject({ code: 'INTERNAL', message: 'Could not reach the server' });
  });

  it('fieldErrors accepts path or field keys, keeps the first message, ignores junk', () => {
    expect(fieldErrors(undefined)).toEqual({});
    expect(fieldErrors([{ field: 'price', message: 'Too high' }, { path: 'price', message: 'dup' }, { nope: 1 }, 'x'])).toEqual({ price: 'Too high' });
  });
});
