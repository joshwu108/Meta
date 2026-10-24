import { existsSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

/**
 * In-process Postgres (PGlite) with just enough of Supabase's auth schema to apply
 * 0100 core + 0200 agent migrations and exercise RLS without Docker.
 */
const AUTH_BOOTSTRAP = `
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role authenticated nologin;
  create role anon nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public, auth to authenticated, anon, service_role;
  grant execute on function auth.uid() to authenticated, anon;
`;

const GRANTS = `
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
`;

function coreMigration(): string {
  const real = "supabase/migrations/0100_core.sql";
  const sql = existsSync(real) ? readFileSync(real, "utf8") : readFileSync("tests/integration/agent/core-standin.sql", "utf8");
  // gen_random_uuid() is built into Postgres 13+; PGlite does not ship pgcrypto.
  return sql.replace(/create extension[^;]*;/gi, "");
}

export async function createAgentDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(AUTH_BOOTSTRAP);
  await db.exec(coreMigration());
  await db.exec(readFileSync("supabase/migrations/0200_agent.sql", "utf8"));
  await db.exec(GRANTS);
  return db;
}

/** Create an auth user and their profile row (01's trigger does this when present). */
export async function addUser(db: PGlite, id: string): Promise<void> {
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${id}@test`]);
  await db.query("insert into profiles (id, display_name) values ($1, 'Test') on conflict (id) do nothing", [id]);
}

/** Run `fn` as an authenticated Supabase user (RLS applies), then restore the superuser. */
export async function asUser<T>(db: PGlite, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  await db.exec("set role authenticated");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}
