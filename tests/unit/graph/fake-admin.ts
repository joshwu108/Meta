/**
 * Minimal stand-in for the PostgREST client used by `graph/server/provenance.ts`: it answers the
 * dedupe read from `rows` and records every insert. Only the handful of builder methods the
 * module calls are implemented, so an unexpected query fails loudly instead of silently passing.
 */
export type StoredRow = {
  actor_id: string;
  subject_id: string;
  pair_lo: string;
  pair_hi: string;
  kind: string;
  ref_id: string | null;
  created_at: string;
};

export type FakeAdmin = {
  client: () => unknown;
  rows: StoredRow[];
  inserted: Record<string, unknown>[][];
  selects: { kinds: string[]; since: string | null }[];
  failSelect: boolean;
  failInsert: boolean;
};

export function fakeAdmin(rows: StoredRow[] = []): FakeAdmin {
  const state: FakeAdmin = {
    rows,
    inserted: [],
    selects: [],
    failSelect: false,
    failInsert: false,
    client: () => ({
      from(table: string) {
        if (table !== 'graph_edge_events') throw new Error(`unexpected table ${table}`);
        return {
          select() {
            const filters = {
              los: null as string[] | null,
              his: null as string[] | null,
              kinds: [] as string[],
              since: null as string | null,
            };
            const builder = {
              in(column: string, values: string[]) {
                if (column === 'pair_lo') filters.los = values;
                else if (column === 'pair_hi') filters.his = values;
                else if (column === 'kind') filters.kinds = values;
                else throw new Error(`unexpected in() on ${column}`);
                return builder;
              },
              gte(column: string, value: string) {
                if (column !== 'created_at') throw new Error(`unexpected gte() on ${column}`);
                filters.since = value;
                return builder;
              },
              then(
                resolve: (result: {
                  data: StoredRow[] | null;
                  error: { message: string } | null;
                }) => unknown,
              ) {
                state.selects.push({ kinds: filters.kinds, since: filters.since });
                if (state.failSelect)
                  return resolve({ data: null, error: { message: 'select failed' } });
                const data = state.rows.filter(
                  (row) =>
                    (!filters.los || filters.los.includes(row.pair_lo)) &&
                    (!filters.his || filters.his.includes(row.pair_hi)) &&
                    (filters.kinds.length === 0 || filters.kinds.includes(row.kind)) &&
                    (!filters.since || row.created_at >= filters.since),
                );
                return resolve({ data, error: null });
              },
            };
            return builder;
          },
          insert(payload: Record<string, unknown>[]) {
            return {
              then(resolve: (result: { error: { message: string } | null }) => unknown) {
                if (state.failInsert) return resolve({ error: { message: 'insert failed' } });
                state.inserted.push(payload);
                for (const row of payload) {
                  state.rows.push({
                    actor_id: String(row.actor_id),
                    subject_id: String(row.subject_id),
                    pair_lo:
                      String(row.actor_id) < String(row.subject_id)
                        ? String(row.actor_id)
                        : String(row.subject_id),
                    pair_hi:
                      String(row.actor_id) < String(row.subject_id)
                        ? String(row.subject_id)
                        : String(row.actor_id),
                    kind: String(row.kind),
                    ref_id: (row.ref_id as string | null) ?? null,
                    created_at: new Date().toISOString(),
                  });
                }
                return resolve({ error: null });
              },
            };
          },
        };
      },
    }),
  };
  return state;
}
