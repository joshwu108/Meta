import type { SupabaseClient, User } from '@supabase/supabase-js';
import { ZodError } from 'zod';
import type { Database } from '@/lib/supabase/database.types';
import { createServerClient } from '@/lib/supabase/server';
import { log, newRequestId } from '@/lib/log';
import { ApiError } from './errors';
import { fail } from './envelope';
import { zodIssues } from './parse-body';

/** Route params as Next.js 15 delivers them (a Promise in the second handler argument). */
export type Params = Record<string, string>;
type RouteContext = { params: Promise<Params> } | { params?: Params };

export type AuthCtx = {
  user: User;
  supabase: SupabaseClient<Database>;
  requestId: string;
};

export type BusinessRow = Database['public']['Tables'] extends { businesses: { Row: infer R } }
  ? R
  : { id: string; owner_id: string; name: string };

export type BusinessCtx = AuthCtx & { business: BusinessRow };

type Handler<Ctx> = (ctx: Ctx, req: Request, params: Params) => Promise<Response>;

async function resolveParams(context: RouteContext | undefined): Promise<Params> {
  if (!context || !('params' in context) || context.params === undefined) return {};
  return await context.params;
}

/** Convert a thrown value into the error envelope. Unknown errors never leak their message. */
export function toErrorResponse(error: unknown, requestId: string): Response {
  if (error instanceof ApiError) {
    return fail(error.code, error.message, error.status, error.details);
  }
  if (error instanceof ZodError) {
    return fail('VALIDATION', 'Validation failed', 400, zodIssues(error));
  }
  log.error('unhandled route error', { requestId, error });
  return fail('INTERNAL', `Something went wrong (request ${requestId})`, 500);
}

/**
 * Wrap a Route Handler so it runs with an authenticated user and a cookie-bound Supabase client.
 * Returns `UNAUTHENTICATED` when there is no session, converts `ApiError` and `ZodError` into
 * the envelope, and logs anything else under a request id.
 */
export function withAuth(handler: Handler<AuthCtx>) {
  return async (req: Request, context?: RouteContext): Promise<Response> => {
    const requestId = newRequestId();
    try {
      const supabase = await createServerClient();
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        return fail('UNAUTHENTICATED', 'Sign in to continue', 401);
      }
      const params = await resolveParams(context);
      return await handler({ user: data.user, supabase, requestId }, req, params);
    } catch (error) {
      return toErrorResponse(error, requestId);
    }
  };
}

/**
 * Like `withAuth`, and also requires the user to own a business (a row in `businesses` with
 * `owner_id = auth.uid()`), injected as `ctx.business`. Returns `FORBIDDEN` otherwise.
 * The `businesses` table is owned by workstream 05; until it lands this helper returns FORBIDDEN.
 */
export function withBusinessOwner(handler: Handler<BusinessCtx>) {
  return withAuth(async (ctx, req, params) => {
    const business = await loadOwnedBusiness(ctx);
    if (!business) throw new ApiError('FORBIDDEN', 'This account does not own a business', 403);
    return handler({ ...ctx, business }, req, params);
  });
}

async function loadOwnedBusiness(ctx: AuthCtx): Promise<BusinessRow | null> {
  // The table name is passed as a string because `businesses` is not in the generated types
  // until workstream 05's migration is merged. The query is still RLS-scoped to the owner.
  const client = ctx.supabase as unknown as SupabaseClient;
  const { data, error } = await client
    .from('businesses')
    .select('*')
    .eq('owner_id', ctx.user.id)
    .maybeSingle();
  if (error) {
    // 42P01 = relation does not exist (migration not applied yet)
    if (error.code === '42P01') return null;
    throw new ApiError('INTERNAL', 'Could not load business', 500);
  }
  return (data as BusinessRow | null) ?? null;
}

/**
 * Wrap a public (unauthenticated) Route Handler so it still gets envelope error handling.
 * Use sparingly; mark the route public in a comment at the call site.
 */
export function withPublic(handler: (req: Request, params: Params, requestId: string) => Promise<Response>) {
  return async (req: Request, context?: RouteContext): Promise<Response> => {
    const requestId = newRequestId();
    try {
      return await handler(req, await resolveParams(context), requestId);
    } catch (error) {
      return toErrorResponse(error, requestId);
    }
  };
}
