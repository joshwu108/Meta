/**
 * OWNED BY WORKSTREAM 01 (src/lib/api). The response envelope and route guards from
 * specs/README.md section 4, so 05's routes are written against the real contract.
 * Main wins on the next sync.
 */
import { NextResponse } from 'next/server';
import { ZodError, type ZodType, type ZodTypeDef } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseServer } from '@/lib/supabase/server';
import { ApiError, type ErrorCode } from './errors';

export type Meta = { total?: number; page?: number; limit?: number };
export type ApiOk<T> = { ok: true; data: T; meta?: Meta };
export type ApiErr = { ok: false; error: { code: ErrorCode; message: string; details?: unknown } };

export function ok<T>(data: T, meta?: Meta, init?: ResponseInit): NextResponse<ApiOk<T>> {
  return NextResponse.json(meta ? { ok: true, data, meta } : { ok: true, data }, init);
}

export function fail(
  code: ErrorCode,
  message: string,
  status?: number,
  details?: unknown,
): NextResponse<ApiErr> {
  const error = new ApiError(code, message, status, details);
  return NextResponse.json(
    { ok: false, error: { code, message, ...(details === undefined ? {} : { details }) } },
    { status: error.status },
  );
}

export type AuthCtx = { user: { id: string; email?: string }; supabase: SupabaseClient };
export type RouteParams = { params: Promise<Record<string, string>> };

/** Reads a dynamic segment, failing with VALIDATION rather than `undefined`. */
export async function param(params: RouteParams['params'], name: string): Promise<string> {
  const value = (await params)[name];
  if (!value) throw new ApiError('VALIDATION', `the ${name} in the URL is missing`);
  return value;
}
export type Handler<C> = (ctx: C, req: Request, params: RouteParams) => Promise<Response>;

/** Zod is the only way a body enters a route (specs/README.md section 1). */
export async function parseBody<T>(
  schema: ZodType<T, ZodTypeDef, unknown>,
  req: Request,
): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError('VALIDATION', 'the request body is not valid JSON');
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ApiError('VALIDATION', 'the request body is not valid', 422, result.error.flatten());
  }
  return result.data;
}

function toResponse(err: unknown): NextResponse<ApiErr> {
  if (err instanceof ApiError) return fail(err.code, err.message, err.status, err.details);
  if (err instanceof ZodError) return fail('VALIDATION', 'the request body is not valid', 422, err.flatten());
  // Unknown failures are logged server-side and never leak their message.
  console.error('[api] unhandled route error', err);
  return fail('INTERNAL', 'something went wrong');
}

export function withAuth(handler: Handler<AuthCtx>): Handler<never> {
  return async (_ctx, req, params) => {
    try {
      const supabase = await supabaseServer();
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) return fail('UNAUTHENTICATED', 'sign in to continue');
      return await handler(
        { user: { id: data.user.id, email: data.user.email ?? undefined }, supabase },
        req,
        params,
      );
    } catch (err) {
      return toResponse(err);
    }
  };
}

export type BusinessContext = {
  id: string;
  ownerId: string;
  name: string;
};

export type BusinessCtx = AuthCtx & { business: BusinessContext };

/** Also resolves the caller's business; no business yet means onboarding is not done. */
export function withBusinessOwner(handler: Handler<BusinessCtx>): Handler<never> {
  return withAuth(async (ctx, req, params) => {
    const { data, error } = await ctx.supabase
      .from('businesses')
      .select('id, owner_id, name')
      .eq('owner_id', ctx.user.id)
      .maybeSingle();

    if (error) return fail('INTERNAL', 'could not read your business');
    if (!data) return fail('NOT_FOUND', 'this account does not own a business yet');

    const row = data as { id: string; owner_id: string; name: string };
    return handler({ ...ctx, business: { id: row.id, ownerId: row.owner_id, name: row.name } }, req, params);
  });
}

/** Routes call the guard with no outer context. */
export const route = <C>(handler: Handler<C>) =>
  (req: Request, params: RouteParams): Promise<Response> =>
    handler(undefined as C, req, params);
