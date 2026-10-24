/**
 * OWNED BY WORKSTREAM 01 — placeholder runner so `pnpm db:seed` works for workstream 05
 * before 01's full seed (15 users, 3 businesses, 6 events, 2 groups) lands. 01's version
 * wins on the next sync; it only has to keep calling `seedBusinesses()`.
 */
import { createClient } from '@supabase/supabase-js';
import { seedBusinesses } from './business-seed';

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });
  const summary = await seedBusinesses(admin);
  console.info(`[seed] ${summary.businesses} businesses, ${summary.proposals} pending proposals`);
}

main().catch((err: unknown) => {
  console.error('[seed] failed', err);
  process.exitCode = 1;
});
