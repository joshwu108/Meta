import type pg from "pg";

/** What the mocked Supabase clients talk to: the current file's test database and signed-in user. */
export const clientState: { pool: pg.Pool | null; userId: string | undefined } = { pool: null, userId: undefined };

export function currentPool(): pg.Pool {
  if (!clientState.pool) throw new Error("clientState.pool is not set; assign it in beforeAll");
  return clientState.pool;
}
