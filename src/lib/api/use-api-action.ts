'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { apiDelete, apiGet, apiPatch, apiPost, isApiClientError } from './client';

type Notify = (message: string, tone?: 'info' | 'success' | 'danger') => void;
type Options<T> = { success?: string | ((data: T) => string); refresh?: boolean };
type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

function call<T>(method: Method, url: string, body?: unknown): Promise<T> {
  if (method === 'GET') return apiGet<T>(url);
  if (method === 'PATCH') return apiPatch<T>(url, body);
  if (method === 'DELETE') return apiDelete<T>(url);
  return apiPost<T>(url, body);
}

/** User-facing text for a failed call. A route that is not deployed yet answers with a plain 404. */
export function errorMessage(error: unknown): string {
  if (!isApiClientError(error)) return 'Something went wrong. Try again.';
  if (error.code === 'INTERNAL' && error.message === 'The server returned 404') return 'This isn’t available yet.';
  return error.message;
}

/**
 * Client hook: run one API mutation with a pending key, report the outcome through `notify`
 * (pass `useToast().toast`), and `router.refresh()` so server components re-read their data.
 * Resolves to the response data, or null when the call failed (the error was already shown).
 */
export function useApiAction(notify: Notify) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  const run = useCallback(
    async <T,>(key: string, url: string, init: { method: Method; body?: unknown }, opts: Options<T> = {}): Promise<T | null> => {
      setPending(key);
      try {
        const data = await call<T>(init.method, url, init.body);
        if (opts.success) notify(typeof opts.success === 'function' ? opts.success(data) : opts.success, 'success');
        if (opts.refresh ?? true) router.refresh();
        return data;
      } catch (error) {
        notify(errorMessage(error), 'danger');
        return null;
      } finally {
        setPending(null);
      }
    },
    [router, notify],
  );

  return { run, pending, isPending: (key: string) => pending === key };
}
