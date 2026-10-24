import type { SupabaseClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ZodSchema } from 'zod';

/** Untyped admin client: seed inserts into tables owned by every workstream, some not yet generated. */
export type AdminClient = SupabaseClient;

export type SeedContext = {
  admin: AdminClient;
  /** email → auth user id, filled by the users loader and reused by every later loader. */
  usersByEmail: Map<string, string>;
  /** business slug → id, filled when the businesses table exists. */
  businessesBySlug: Map<string, string>;
  log: (message: string) => void;
};

export const FIXTURES_DIR = path.join(process.cwd(), 'supabase', 'seed', 'fixtures');

/** Read and validate a fixture file. */
export async function loadFixture<T>(name: string, schema: ZodSchema<T>): Promise<T[]> {
  const raw = JSON.parse(await readFile(path.join(FIXTURES_DIR, `${name}.json`), 'utf8')) as unknown[];
  return raw.map((item, index) => {
    const parsed = schema.safeParse(item);
    if (!parsed.success) {
      throw new Error(`fixture ${name}.json[${index}] invalid: ${JSON.stringify(parsed.error.issues)}`);
    }
    return parsed.data;
  });
}

/** True when a Postgres error means the relation does not exist yet (another workstream's table). */
export function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42P01' || error.code === 'PGRST205' || /does not exist|Could not find the table/i.test(error.message ?? '');
}

/** True when the table exists but a column we insert does not (another workstream changed its shape). */
export function isSchemaMismatch(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42703' || error.code === 'PGRST204' || /column .* does not exist|Could not find the '.*' column/i.test(error.message ?? '');
}

/**
 * Decide how a loader reacts to an insert error on a table owned by another workstream:
 * missing table or column → log and skip (returns true); anything else → caller throws.
 */
export function skipIfForeignSchema(ctx: SeedContext, table: string, error: { code?: string; message?: string }): boolean {
  if (isMissingTable(error)) {
    ctx.log(`${table} table not migrated yet; skipping ${table}`);
    return true;
  }
  if (isSchemaMismatch(error)) {
    ctx.log(`${table} columns differ from the seed loader (${error.message}); skipping ${table}. The owning workstream should update supabase/seed/loaders/domain.ts`);
    return true;
  }
  return false;
}

export function requireUser(ctx: SeedContext, email: string): string {
  const id = ctx.usersByEmail.get(email);
  if (!id) throw new Error(`seed references unknown user ${email}`);
  return id;
}
