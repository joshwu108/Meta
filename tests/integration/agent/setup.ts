import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Local `supabase start` stack. Tests skip when it is not reachable. */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export async function supabaseAvailable(): Promise<boolean> {
  if (!ANON || !SERVICE) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/user_preferences?select=user_id&limit=1`, {
      headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` },
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const admin = (): SupabaseClient => createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

/** Create a confirmed user (profile row comes from 01's trigger) and a signed-in client for them. */
export async function makeUser(tag: string): Promise<{ id: string; sb: SupabaseClient }> {
  const email = `it-ws02-${tag}-${Date.now()}@weave.test`;
  const password = "test-pass-1234";
  const created = await admin().auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error("createUser failed");
  const sb = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const signed = await sb.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  return { id: created.data.user.id, sb };
}

export async function deleteUser(id: string): Promise<void> {
  await admin().auth.admin.deleteUser(id);
}
