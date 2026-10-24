import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { publicEnv, serverEnv } from '@/lib/env';
import type { Database } from './database.types';

let cached: SupabaseClient<Database> | null = null;

/**
 * Service-role client that bypasses RLS. Only `notify()`, `logAgentAction()`, the seed runner
 * and the workstream 04 pipeline may use it. Never import from client components.
 */
export function createAdminClient(): SupabaseClient<Database> {
  if (cached) return cached;
  cached = createClient<Database>(publicEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
