import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const TEST_DOMAIN = 'itest.weave.test';

export function adminClient(): SupabaseClient<Database> {
  return createClient<Database>(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export type TestUser = { id: string; email: string; client: SupabaseClient<Database> };

/** Create a confirmed auth user (profile created by trigger) and return a client signed in as them. */
export async function createTestUser(admin: SupabaseClient<Database>, label: string, meta: Record<string, unknown> = {}): Promise<TestUser> {
  const email = `${label}-${crypto.randomUUID().slice(0, 8)}@${TEST_DOMAIN}`;
  const password = 'itest-pass-1234';
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: `Test ${label}`, is_adult_confirmed: true, ...meta },
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  const client = createClient<Database>(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error(`signIn failed: ${signIn.error.message}`);
  return { id: data.user.id, email, client };
}

/** Delete every auth user created by the integration tests. */
export async function cleanupTestUsers(admin: SupabaseClient<Database>): Promise<void> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 500 });
  await Promise.all(
    (data?.users ?? [])
      .filter((user) => user.email?.endsWith(`@${TEST_DOMAIN}`))
      .map((user) => admin.auth.admin.deleteUser(user.id)),
  );
}
