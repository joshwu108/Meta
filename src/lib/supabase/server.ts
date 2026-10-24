import { createServerClient as createSsrClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { publicEnv } from '@/lib/env';
import type { Database } from './database.types';

/**
 * Supabase client bound to the request cookies. Use in Server Components, Server Actions and
 * Route Handlers. Writes to cookies are ignored inside Server Components (the middleware
 * refreshes sessions there).
 */
export async function createServerClient() {
  const cookieStore = await cookies();
  return createSsrClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are read-only there, middleware refreshes.
        }
      },
    },
  });
}
