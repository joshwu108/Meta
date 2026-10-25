import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { log } from '@/lib/log';

/**
 * Reads and writes the vector tables from migration 0702. Both have RLS on with no policies, so
 * every call here needs the service-role client.
 *
 * Every read fails soft: a missing table (migration not applied) or an unreachable database
 * returns nothing, and the caller degrades to exact-tag matching rather than erroring. A
 * semantic bonus is an enhancement, never a dependency.
 */

export type TagVector = { tag: string; embedding: number[] };

/** Postgres `vector` comes back as the string "[0.1,0.2,...]" over PostgREST. */
function parseVector(value: unknown): number[] | null {
  if (Array.isArray(value)) return value as number[];
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as number[]) : null;
  } catch {
    return null;
  }
}

function softFail(operation: string, error: unknown): void {
  log.warn('embeddings.unavailable', {
    operation,
    error: error instanceof Error ? error.message : String(error),
  });
}

export async function upsertTagEmbeddings(admin: SupabaseClient, rows: readonly TagVector[]): Promise<number> {
  if (rows.length === 0) return 0;
  const { error } = await admin
    .from('interest_embeddings')
    .upsert(rows.map((r) => ({ tag: r.tag, embedding: JSON.stringify(r.embedding), updated_at: new Date().toISOString() })) as never);
  if (error) {
    softFail('upsertTagEmbeddings', error);
    return 0;
  }
  return rows.length;
}

export async function getTagEmbeddings(admin: SupabaseClient, tags: readonly string[]): Promise<Map<string, number[]>> {
  const wanted = [...new Set(tags)];
  if (wanted.length === 0) return new Map();
  const { data, error } = await admin.from('interest_embeddings').select('tag, embedding').in('tag', wanted);
  if (error) {
    softFail('getTagEmbeddings', error);
    return new Map();
  }
  const out = new Map<string, number[]>();
  for (const row of (data ?? []) as { tag: string; embedding: unknown }[]) {
    const vector = parseVector(row.embedding);
    if (vector) out.set(row.tag, vector);
  }
  return out;
}

export type ProfileVector = { userId: string; embedding: number[]; sourceHash: string };

export async function upsertProfileEmbeddings(admin: SupabaseClient, rows: readonly ProfileVector[]): Promise<number> {
  if (rows.length === 0) return 0;
  const { error } = await admin.from('profile_embeddings').upsert(
    rows.map((r) => ({
      user_id: r.userId,
      embedding: JSON.stringify(r.embedding),
      source_hash: r.sourceHash,
      updated_at: new Date().toISOString(),
    })) as never,
  );
  if (error) {
    softFail('upsertProfileEmbeddings', error);
    return 0;
  }
  return rows.length;
}

export async function getProfileEmbeddings(
  admin: SupabaseClient,
  userIds: readonly string[],
): Promise<Map<string, number[]>> {
  const wanted = [...new Set(userIds)];
  if (wanted.length === 0) return new Map();
  const { data, error } = await admin.from('profile_embeddings').select('user_id, embedding').in('user_id', wanted);
  if (error) {
    softFail('getProfileEmbeddings', error);
    return new Map();
  }
  const out = new Map<string, number[]>();
  for (const row of (data ?? []) as { user_id: string; embedding: unknown }[]) {
    const vector = parseVector(row.embedding);
    if (vector) out.set(row.user_id, vector);
  }
  return out;
}

/** `source_hash` per user, so a backfill can skip rows whose text has not changed. */
export async function getProfileHashes(admin: SupabaseClient): Promise<Map<string, string>> {
  const { data, error } = await admin.from('profile_embeddings').select('user_id, source_hash');
  if (error) {
    softFail('getProfileHashes', error);
    return new Map();
  }
  return new Map((data ?? []).map((r) => [(r as { user_id: string }).user_id, (r as { source_hash: string }).source_hash]));
}
