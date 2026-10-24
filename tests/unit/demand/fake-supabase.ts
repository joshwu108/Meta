import { vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

export type FakeResult = { data: unknown; error: { code?: string; message: string } | null };

/**
 * A chainable PostgREST stand-in. Every builder call is recorded; each awaited chain (or
 * `single` / `maybeSingle` / `rpc`) takes the next queued result, repeating the last one.
 */
export function fakeClient(...results: FakeResult[]) {
  const queue = [...results];
  const next = (): FakeResult => (queue.length > 1 ? (queue.shift() as FakeResult) : (queue[0] as FakeResult));
  const calls: Array<[string, unknown[]]> = [];
  const chain: Record<string, unknown> = {};
  const record = (name: string) => (...args: unknown[]) => {
    calls.push([name, args]);
    return chain;
  };
  for (const name of ['from', 'select', 'eq', 'gte', 'not', 'limit', 'insert', 'update', 'in', 'order']) chain[name] = record(name);
  chain['maybeSingle'] = async () => next();
  chain['single'] = async () => next();
  chain['then'] = (resolve: (r: FakeResult) => unknown) => resolve(next());
  const rpc = vi.fn(async (..._args: unknown[]) => next());
  return { client: { ...chain, rpc } as unknown as SupabaseClient, calls, rpc };
}
