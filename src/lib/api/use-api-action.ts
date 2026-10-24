'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { fetchJson } from './fetch-json';

type Notify = (message: string, tone?: 'info' | 'success' | 'danger') => void;
type Options<T> = { success?: string | ((data: T) => string); refresh?: boolean };

/**
 * Client hook: run one API mutation with a pending key, report the outcome through `notify`
 * (pass `useToast().toast`), and `router.refresh()` so server components re-read their data.
 * Resolves to the response data, or null when the call failed (the error was already shown).
 */
export function useApiAction(notify: Notify) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  const run = useCallback(
    async <T,>(key: string, url: string, init: { method: string; body?: unknown }, opts: Options<T> = {}): Promise<T | null> => {
      setPending(key);
      const res = await fetchJson<T>(url, init);
      setPending(null);
      if (!res.ok) {
        notify(res.error.message, 'danger');
        return null;
      }
      if (opts.success) notify(typeof opts.success === 'function' ? opts.success(res.data) : opts.success, 'success');
      if (opts.refresh ?? true) router.refresh();
      return res.data;
    },
    [router, notify],
  );

  return { run, pending, isPending: (key: string) => pending === key };
}
