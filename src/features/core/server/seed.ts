import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { log } from '@/lib/log';
import { runSeedWith, type SeedSummary } from '../../../../supabase/seed/runner';

/** Run the demo seed from inside the app (`POST /api/dev/seed`). */
export async function runSeed(): Promise<SeedSummary> {
  const admin = createAdminClient() as unknown as SupabaseClient;
  return runSeedWith(admin, (step) => log.info('seed', { step }));
}
