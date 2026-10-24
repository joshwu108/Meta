/* CLI entry: `pnpm db:seed`. Reads .env / .env.local, seeds the local stack with the service role. */
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { runSeedWith } from './runner';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Copy .env.example to .env and paste the keys printed by pnpm db:start.`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const url = required('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRole = required('SUPABASE_SERVICE_ROLE_KEY');
  if (/supabase\.co$/.test(new URL(url).hostname) && process.env.ALLOW_REMOTE_SEED !== '1') {
    console.error('Refusing to seed a hosted project. Set ALLOW_REMOTE_SEED=1 if you really mean it.');
    process.exit(1);
  }
  const admin = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
  const summary = await runSeedWith(admin, (message) => console.log(`[seed] ${message}`));
  console.log(`[seed] done in ${summary.durationMs}ms`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error: unknown) => {
  console.error('[seed] failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
