type Result = { data: unknown; error: { message: string; code?: string } | null };
export type Call = { table: string; ops: [string, unknown[]][] };

/**
 * Chainable stand-in for the supabase-js query builder. Records every call and
 * resolves with the next queued result for that table (or { data: null }).
 */
export function createFakeSupabase(results: Record<string, Result[]> = {}) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const next = () => Promise.resolve(results[table]?.shift() ?? { data: null, error: null });
      const builder: Record<string, unknown> = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === "then") return (res: (v: Result) => unknown, rej: (e: unknown) => unknown) => next().then(res, rej);
          return (...args: unknown[]) => {
            call.ops.push([prop, args]);
            return builder;
          };
        },
      });
      return builder;
    },
  };
  return { client: client as never, calls, results };
}

export const op = (call: Call, name: string) => call.ops.find(([n]) => n === name)?.[1];
