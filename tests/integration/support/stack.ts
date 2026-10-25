import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Helpers for the integration tests, which run against the local stack
 * (`supabase start`). Every suite calls `localStack()` first and skips itself when no
 * stack is reachable, so `pnpm test` stays green on a machine without the Supabase CLI.
 */

export const STACK_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export type Stack = { admin: SupabaseClient; anonKey: string };

let probe: Promise<Stack | null> | null = null;

async function reachable(): Promise<Stack | null> {
  if (!SERVICE_KEY || !ANON_KEY) return null;
  try {
    const response = await fetch(`${STACK_URL}/auth/v1/health`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return null;
  } catch {
    return null;
  }
  return {
    admin: createClient(STACK_URL, SERVICE_KEY, { auth: { persistSession: false } }),
    anonKey: ANON_KEY,
  };
}

/** Memoized so a run with several suites probes the stack once. */
export const localStack = (): Promise<Stack | null> => (probe ??= reachable());

export const SKIP_REASON =
  'no local Supabase stack (set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY, then run `supabase start`)';

/** A fresh auth user plus a client signed in as them, so RLS applies to their reads. */
export async function signedInOwner(
  stack: Stack,
  email: string,
): Promise<{ userId: string; client: SupabaseClient }> {
  const password = 'weave-test-password';
  const existing = await stack.admin.auth.admin.listUsers({ perPage: 200 });
  const found = existing.data?.users.find((user) => user.email === email);

  const userId =
    found?.id ??
    (
      await stack.admin.auth.admin.createUser({ email, password, email_confirm: true })
    ).data.user?.id;

  if (!userId) throw new Error(`could not create ${email}`);

  const client = createClient(STACK_URL, stack.anonKey, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`could not sign in ${email}: ${error.message}`);

  return { userId, client };
}

/** Removes everything a suite created, newest table first so FKs do not block. */
export async function cleanup(stack: Stack, businessIds: readonly string[]): Promise<void> {
  for (const id of businessIds) {
    await stack.admin.from('events').delete().eq('business_id', id);
    await stack.admin.from('event_proposals').delete().eq('business_id', id);
    await stack.admin.from('business_capabilities').delete().eq('business_id', id);
    await stack.admin.from('businesses').delete().eq('id', id);
  }
}

export const uniqueEmail = (label: string): string => `ws05.${label}@weave.test`;
