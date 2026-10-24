import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";
import type { NotificationType } from "@/shared/enums";

// Stand-ins for 01's src/lib/api, src/lib/supabase and features/core, matching the
// signatures in specs/01-core-platform/specs.md §4. Swap imports when 01 merges.

export type ErrorCode =
  | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT"
  | "CAPACITY_FULL" | "RATE_LIMITED" | "AI_UNAVAILABLE" | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, VALIDATION: 400, CONFLICT: 409,
  CAPACITY_FULL: 409, RATE_LIMITED: 429, AI_UNAVAILABLE: 503, INTERNAL: 500,
};

export class ApiError extends Error {
  constructor(public code: ErrorCode, message: string, public status = STATUS[code], public details?: unknown) {
    super(message);
  }
}

type Meta = { total?: number; page?: number; limit?: number };

export function ok<T>(data: T, meta?: Meta, init?: ResponseInit): NextResponse {
  return NextResponse.json(meta ? { ok: true, data, meta } : { ok: true, data }, init);
}

export function fail(code: ErrorCode, message: string, status = STATUS[code], details?: unknown): NextResponse {
  return NextResponse.json({ ok: false, error: { code, message, ...(details === undefined ? {} : { details }) } }, { status });
}

export async function parseBody<T>(schema: ZodSchema<T>, req: Request): Promise<T> {
  const raw: unknown = await req.json().catch(() => {
    throw new ApiError("VALIDATION", "Request body must be JSON");
  });
  return schema.parse(raw);
}

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new ApiError("INTERNAL", `${name} is not configured`);
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

export type AuthCtx = { user: User; supabase: SupabaseClient };
type RouteContext = { params: Promise<Record<string, string>> };

export function withAuth(handler: (ctx: AuthCtx, req: Request, params: Record<string, string>) => Promise<Response>) {
  return async (req: Request, context: RouteContext): Promise<Response> => {
    try {
      const supabase = await createUserClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) return fail("UNAUTHENTICATED", "Sign in to continue");
      return await handler({ user: data.user, supabase }, req, await context.params);
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

export function toErrorResponse(err: unknown): Response {
  if (err instanceof ApiError) return fail(err.code, err.message, err.status, err.details);
  if (err instanceof ZodError) return fail("VALIDATION", "Invalid request", 400, err.flatten());
  console.error(JSON.stringify({ level: "error", msg: "unhandled route error", error: String(err) }));
  return fail("INTERNAL", "Something went wrong");
}

export async function notify(userId: string, type: NotificationType, payload: Record<string, unknown>): Promise<void> {
  const { error } = await createAdminClient().from("notifications").insert({ user_id: userId, type, payload });
  if (error) throw new ApiError("INTERNAL", "Could not create notification");
}

export async function logAgentAction(input: {
  userId: string; action: string; permissionsUsed: string[]; result: string;
}): Promise<void> {
  const { error } = await createAdminClient().from("agent_action_log").insert({
    user_id: input.userId, actor: "coordination", action: input.action,
    permissions_used: input.permissionsUsed, result: input.result,
  });
  if (error) throw new ApiError("INTERNAL", "Could not log agent action");
}
