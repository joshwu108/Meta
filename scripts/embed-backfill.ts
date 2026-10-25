/**
 * Fills the pgvector tables from migration 0702.
 *   pnpm embed:backfill          # only rows whose text changed
 *   pnpm embed:backfill --force  # re-embed everything
 *
 * Two passes:
 *   interest_embeddings  every distinct interest tag across all users, plus the tags the
 *                        category taxonomy knows about. Small and shared; this is what makes
 *                        the "nearest concept pair" explanation possible.
 *   profile_embeddings   one vector per user over their preference text, skipping rows whose
 *                        `source_hash` already matches so a reseed does not re-embed 300 people.
 */
import { config as loadEnv } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { embed } from '../src/lib/embeddings/model';
import { profileText, sourceHash, tagText } from '../src/lib/embeddings/text';
import {
  getProfileHashes,
  upsertProfileEmbeddings,
  upsertTagEmbeddings,
} from '../src/lib/embeddings/store';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

/** Embedding a few hundred short strings at once is fast; keep batches modest for memory. */
const BATCH = 64;

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Run pnpm db:start and copy the keys into .env.local`);
    process.exit(1);
  }
  return value;
}

type PreferenceRow = {
  user_id: string;
  interests: string[] | null;
  interest_categories: string[] | null;
  social_goals: string[] | null;
  activity_prefs: string[] | null;
};

async function chunked<T>(items: readonly T[], size: number, run: (batch: T[]) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += size) await run(items.slice(i, i + size));
}

async function backfillTags(admin: SupabaseClient, rows: readonly PreferenceRow[]): Promise<number> {
  const tags = [...new Set(rows.flatMap((r) => r.interests ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean))];
  let written = 0;
  await chunked(tags, BATCH, async (batch) => {
    const vectors = await embed(batch.map(tagText));
    written += await upsertTagEmbeddings(
      admin,
      batch.map((tag, i) => ({ tag, embedding: vectors[i] as number[] })),
    );
  });
  return written;
}

async function backfillProfiles(
  admin: SupabaseClient,
  rows: readonly PreferenceRow[],
  bios: ReadonlyMap<string, string | null>,
  force: boolean,
): Promise<{ written: number; skipped: number }> {
  const existing = force ? new Map<string, string>() : await getProfileHashes(admin);
  const pending = rows.flatMap((row) => {
    const text = profileText({
      interests: row.interests ?? [],
      interestCategories: row.interest_categories ?? [],
      socialGoals: row.social_goals ?? [],
      activityPrefs: row.activity_prefs ?? [],
      bio: bios.get(row.user_id) ?? null,
    });
    if (text.length === 0) return [];
    const hash = sourceHash(text);
    return existing.get(row.user_id) === hash ? [] : [{ userId: row.user_id, text, hash }];
  });

  let written = 0;
  await chunked(pending, BATCH, async (batch) => {
    const vectors = await embed(batch.map((p) => p.text));
    written += await upsertProfileEmbeddings(
      admin,
      batch.map((p, i) => ({ userId: p.userId, embedding: vectors[i] as number[], sourceHash: p.hash })),
    );
  });
  return { written, skipped: rows.length - pending.length };
}

async function main(): Promise<number> {
  const force = process.argv.includes('--force');
  const admin = createClient(required('NEXT_PUBLIC_SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });

  const { data: prefs, error } = await admin
    .from('user_preferences')
    .select('user_id, interests, interest_categories, social_goals, activity_prefs');
  if (error) {
    console.error(`reading user_preferences failed: ${error.message}`);
    return 1;
  }
  const rows = (prefs ?? []) as PreferenceRow[];
  if (rows.length === 0) {
    console.log('no preference rows; nothing to embed');
    return 0;
  }

  const { data: profiles } = await admin.from('profiles').select('id, bio');
  const bios = new Map(((profiles ?? []) as { id: string; bio: string | null }[]).map((p) => [p.id, p.bio]));

  const started = Date.now();
  const tags = await backfillTags(admin, rows);
  const { written, skipped } = await backfillProfiles(admin, rows, bios, force);
  console.log(
    `embedded ${tags} interest tags and ${written} profiles (${skipped} unchanged) in ${Date.now() - started}ms`,
  );
  return 0;
}

main().then((code) => process.exit(code));
