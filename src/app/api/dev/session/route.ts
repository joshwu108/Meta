import { z } from 'zod';
import { fail, ok, parseBody, route, withAuth } from '@/lib/api/envelope';
import { devRoutesEnabled } from '@/lib/api/dev-routes';
import { supabaseServer } from '@/lib/supabase/server';

/**
 * Dev-only sign-in, in the same spirit as `POST /api/dev/proposals` (spec section 11):
 * it exists so 05's Playwright suite can reach the business screens before workstream 01
 * ships `/login`. Delete it once the demo signs in through the real page.
 *
 * This is **not** an auth bypass. It performs an ordinary email + password sign-in through
 * Supabase and lets the SSR client write the session cookies; invalid credentials are
 * refused exactly as they would be on a login form. It still answers 404 in production.
 */

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(200),
});

export const POST = route<never>(async (_ctx, req) => {
  if (!devRoutesEnabled()) {
    return fail('NOT_FOUND', 'not found');
  }

  const { email, password } = await parseBody(bodySchema, req);
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    return fail('UNAUTHENTICATED', 'those credentials were not accepted');
  }
  return ok({ userId: data.user.id });
});

/** Confirms the session landed, so a test can assert it before navigating. */
export const GET = route(
  withAuth(async (ctx) => {
    if (!devRoutesEnabled()) {
      return fail('NOT_FOUND', 'not found');
    }
    return ok({ userId: ctx.user.id, email: ctx.user.email ?? null });
  }),
);
