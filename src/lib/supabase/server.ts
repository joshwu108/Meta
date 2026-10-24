/**
 * OWNED BY WORKSTREAM 01 (src/lib/supabase). Request-scoped client so RLS applies to every
 * read and write a route makes. Main wins on the next sync.
 */
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set; copy .env.example to .env.local`);
  return value;
}

export async function supabaseServer(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (toSet: { name: string; value: string; options: CookieOptions }[]) => {
          // A Server Component render cannot set cookies; middleware refreshes the session.
          try {
            for (const { name, value, options } of toSet) store.set(name, value, options);
          } catch {
            /* read-only cookie store */
          }
        },
      },
    },
  );
}
