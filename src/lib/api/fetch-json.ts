import type { ApiResponse } from './envelope';

/**
 * Browser-side call to one of our Route Handlers. Always resolves to the envelope; network
 * failures and non-JSON responses (e.g. a route that is not deployed yet) become an error envelope
 * so callers handle a single shape. Import this file directly from client components (the
 * `@/lib/api` index pulls in server-only modules).
 */
export async function fetchJson<T>(url: string, init: { method?: string; body?: unknown } = {}): Promise<ApiResponse<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? 'GET',
      cache: 'no-store',
      headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    return { ok: false, error: { code: 'INTERNAL', message: 'Could not reach CommonGround. Check your connection and try again.' } };
  }
  try {
    return (await res.json()) as ApiResponse<T>;
  } catch {
    return res.status === 404
      ? { ok: false, error: { code: 'NOT_FOUND', message: 'This isn’t available yet.' } }
      : { ok: false, error: { code: 'INTERNAL', message: `Something went wrong (${res.status}). Try again.` } };
  }
}
