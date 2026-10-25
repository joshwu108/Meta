import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * A fake `supabase-js` client covering exactly the builder surface
 * `createSupabaseStore()` uses. It exists so the store adapter's column lists, its
 * "table does not exist yet" guards and its error mapping can be unit-tested without a
 * database; RLS behaviour is pinned by the integration tests instead.
 */

export type FakeResult = { data?: unknown; error?: unknown; count?: number };

export type FakeCall = {
  table?: string;
  rpc?: string;
  op: string;
  args: unknown[];
};

type Responder = (call: FakeCall) => FakeResult;

class FakeQuery implements PromiseLike<FakeResult> {
  constructor(
    private readonly table: string,
    private readonly responder: Responder,
    private readonly calls: FakeCall[],
  ) {}

  private record(op: string, ...args: unknown[]): this {
    this.calls.push({ table: this.table, op, args });
    return this;
  }

  private settle(op: string, ...args: unknown[]): Promise<FakeResult> {
    const call: FakeCall = { table: this.table, op, args };
    this.calls.push(call);
    const result = this.responder(call);
    return Promise.resolve({ data: null, error: null, ...result });
  }

  select = (...args: unknown[]) => this.record('select', ...args);
  eq = (...args: unknown[]) => this.record('eq', ...args);
  in = (...args: unknown[]) => this.record('in', ...args);
  gte = (...args: unknown[]) => this.record('gte', ...args);
  order = (...args: unknown[]) => this.record('order', ...args);
  insert = (...args: unknown[]) => this.record('insert', ...args);
  update = (...args: unknown[]) => this.record('update', ...args);
  upsert = (...args: unknown[]) => this.record('upsert', ...args);
  delete = (...args: unknown[]) => this.record('delete', ...args);

  maybeSingle = () => this.settle('maybeSingle');
  single = () => this.settle('single');

  then<TResult1 = FakeResult, TResult2 = never>(
    onFulfilled?: ((value: FakeResult) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.settle('await').then(onFulfilled, onRejected);
  }
}

export type FakeClient = {
  client: SupabaseClient;
  calls: FakeCall[];
};

/**
 * `responder` is called once per terminal operation and decides what comes back. The
 * default is an empty success.
 */
export function fakeSupabase(responder: Responder = () => ({})): FakeClient {
  const calls: FakeCall[] = [];
  const client = {
    from: (table: string) => new FakeQuery(table, responder, calls),
    rpc: (name: string, args: unknown) => {
      const call: FakeCall = { rpc: name, op: 'rpc', args: [args] };
      calls.push(call);
      return Promise.resolve({ data: null, error: null, ...responder(call) });
    },
  };

  return { client: client as unknown as SupabaseClient, calls };
}

/** The Postgres code for "relation does not exist" — a table a workstream has not merged. */
export const UNDEFINED_TABLE_ERROR = { code: '42P01', message: 'relation does not exist' };
