/**
 * OWNED BY WORKSTREAM 01 (src/lib/supabase). Minimal service-role client so workstream 05
 * can run its RPCs and its service-role-only fan-out before 01's typed clients land.
 * Main wins on the next sync.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set; copy .env.example to .env.local`);
  return value;
}

/**
 * Bypasses RLS. Only for code paths the spec marks service-role: the demand cohort
 * fan-out on publish, and reads of `demand_cluster_members` whose ids never leave
 * the server.
 */
export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(required('NEXT_PUBLIC_SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/** Test seam: drop the memoized client so a test can point at another project. */
export const resetSupabaseAdmin = (): void => {
  cached = null;
};
