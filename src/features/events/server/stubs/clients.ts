import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// Stand-ins for 01's src/lib/supabase/{server,admin}.ts. Kept apart so tests can swap the clients.

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

/** Cookie-bound client: every query runs under the signed-in user's RLS. */
export async function createUserClient(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (items) => items.forEach(({ name, value, options }) => store.set(name, value, options)),
    },
  });
}

/** Service-role client. Only for cross-user reads this feature filters itself, and for notify(). */
export function createAdminClient(): SupabaseClient {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
