import 'server-only';
import { after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { defaultRouteDeps, type RouteDeps } from './routes';
import { getRunView } from './store-supabase';
import { supabaseDeps } from './wiring';

/** Production wiring for the 04 route files. */
export function routeDeps(): RouteDeps {
  const admin = () => createAdminClient() as unknown as SupabaseClient;
  return defaultRouteDeps({
    pipeline: () => supabaseDeps(admin()),
    schedule: (task) => after(task),
    getRunView: (runId) => getRunView(admin(), runId),
  });
}
