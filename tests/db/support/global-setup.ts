import pg from "pg";

const ADMIN_URL = process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/postgres";

/**
 * Drops `cg06_test_*` databases left behind by an interrupted run. Plain DROP (no FORCE) fails
 * on a database that still has connections, so a suite running elsewhere is never touched.
 */
export default async function dropStaleTestDatabases(): Promise<void> {
  const admin = new pg.Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 1500 });
  try {
    await admin.connect();
  } catch {
    return; // no local Postgres: the suites skip themselves
  }
  try {
    const { rows } = await admin.query<{ datname: string }>(
      `select datname from pg_database d
        where datname like 'cg06\\_test\\_%' and not exists (select 1 from pg_stat_activity a where a.datname = d.datname)`,
    );
    for (const { datname } of rows) await admin.query(`drop database "${datname}"`).catch(() => undefined);
  } finally {
    await admin.end();
  }
}
