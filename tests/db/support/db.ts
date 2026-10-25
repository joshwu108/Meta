import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const ADMIN_URL = process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/postgres";
const ROOT = join(import.meta.dirname, "..", "..", "..");

export type TestDb = {
  pool: pg.Pool;
  /** Runs fn in a transaction where auth.uid() returns userId, like a Supabase request. */
  asUser<T>(userId: string, fn: (client: pg.PoolClient) => Promise<T>): Promise<T>;
  drop(): Promise<void>;
};

/** True when a local Postgres is reachable; integration suites skip themselves otherwise. */
export async function isDbAvailable(): Promise<boolean> {
  const client = new pg.Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 1500 });
  try {
    await client.connect();
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function migrationFiles(): Promise<string[]> {
  const dir = join(ROOT, "supabase", "migrations");
  const names = (await readdir(dir)).filter((n) => n.startsWith("06") && n.endsWith(".sql")).sort();
  return names.map((n) => join(dir, n));
}

/** Creates a throwaway database with upstream stand-ins plus every 06xx migration applied. */
export async function createTestDb(): Promise<TestDb> {
  const name = `cg06_test_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();

  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: url.toString(), max: 25 });
  await pool.query(await readFile(join(ROOT, "tests", "db", "support", "upstream.sql"), "utf8"));
  for (const file of await migrationFiles()) {
    await pool.query(await readFile(file, "utf8"));
  }

  return {
    pool,
    async asUser(userId, fn) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
        const result = await fn(client);
        await client.query("commit");
        return result;
      } catch (err) {
        await client.query("rollback");
        throw err;
      } finally {
        client.release();
      }
    },
    async drop() {
      await pool.end();
      const cleanup = new pg.Client({ connectionString: ADMIN_URL });
      await cleanup.connect();
      await cleanup.query(`drop database if exists ${name} with (force)`);
      await cleanup.end();
    },
  };
}

export type RlsRole = {
  /** Runs fn in a transaction as the non-superuser role, with auth.uid() = userId, so RLS applies. */
  as<T>(userId: string, fn: (client: pg.PoolClient) => Promise<T>): Promise<T>;
  drop(): Promise<void>;
};

/**
 * Creates a throwaway NOLOGIN role (like Supabase's `authenticated`) with table and function
 * grants on the test database. Call `drop()` after `TestDb.drop()`.
 */
export async function createRlsRole(db: TestDb): Promise<RlsRole> {
  const role = `cg06_rls_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  await db.pool.query(`create role ${role} nologin`);
  // Not a superuser on Supabase's Postgres: SET ROLE needs membership in the role.
  await db.pool.query(`grant ${role} to current_user`);
  await db.pool.query(`grant usage on schema public, auth to ${role}`);
  await db.pool.query(`grant select, insert, update, delete on all tables in schema public to ${role}`);
  await db.pool.query(`grant execute on all functions in schema public, auth to ${role}`);
  return {
    async as(userId, fn) {
      const client = await db.pool.connect();
      try {
        await client.query("begin");
        await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
        await client.query(`set local role ${role}`);
        const result = await fn(client);
        await client.query("commit");
        return result;
      } catch (err) {
        await client.query("rollback");
        throw err;
      } finally {
        client.release();
      }
    },
    async drop() {
      const admin = new pg.Client({ connectionString: ADMIN_URL });
      await admin.connect();
      await admin.query(`drop role if exists ${role}`);
      await admin.end();
    },
  };
}
