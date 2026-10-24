import "server-only";
/**
 * Stand-ins for workstream 01 contracts (src/lib/api, src/lib/ai, src/lib/supabase,
 * features/core) with the exact signatures from specs/01-core-platform/specs.md.
 * Delete this file and repoint the imports once 01 lands on main.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { ZodError, type ZodSchema } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "CAPACITY_FULL"
  | "RATE_LIMITED"
  | "AI_UNAVAILABLE"
  | "INTERNAL";

type Meta = { total?: number; page?: number; limit?: number };

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  CONFLICT: 409,
  CAPACITY_FULL: 409,
  RATE_LIMITED: 429,
  AI_UNAVAILABLE: 503,
  INTERNAL: 500,
};

export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public status = STATUS[code],
    public details?: unknown,
  ) {
    super(message);
  }
}

export function ok<T>(data: T, meta?: Meta, init?: ResponseInit): NextResponse {
  return NextResponse.json(meta ? { ok: true, data, meta } : { ok: true, data }, init);
}

export function fail(code: ErrorCode, message: string, status = STATUS[code], details?: unknown) {
  const error = details === undefined ? { code, message } : { code, message, details };
  return NextResponse.json({ ok: false, error }, { status });
}

export async function parseBody<T>(schema: ZodSchema<T>, req: Request): Promise<T> {
  const raw: unknown = await req.json().catch(() => {
    throw new ApiError("VALIDATION", "Request body must be JSON");
  });
  return schema.parse(raw);
}

export type AuthCtx = { user: User; supabase: SupabaseClient };
type Params = { params: Promise<Record<string, string>> };

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) return fail(err.code, err.message, err.status, err.details);
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    return fail("VALIDATION", "Invalid request", 400, details);
  }
  console.error(JSON.stringify({ level: "error", msg: "unhandled", name: (err as Error)?.name }));
  return fail("INTERNAL", "Something went wrong");
}

export async function createRouteClient(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (all) => all.forEach(({ name, value, options }) => store.set(name, value, options)),
    },
  });
}

export function withAuth(handler: (ctx: AuthCtx, req: Request, params: Params) => Promise<Response>) {
  return async (req: Request, params: Params): Promise<Response> => {
    try {
      const supabase = await createRouteClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) return fail("UNAUTHENTICATED", "Sign in to continue");
      return await handler({ user: data.user, supabase }, req, params);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

let admin: SupabaseClient | null = null;
/** Service-role client. Only for cross-user reads behind consent checks. */
export function getAdminClient(): SupabaseClient {
  admin ??= createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
  return admin;
}

export async function logAgentAction(input: {
  userId: string | null;
  action: string;
  permissionsUsed: string[];
  result: string;
  actor?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await getAdminClient().from("agent_action_log").insert({
    user_id: input.userId,
    actor: input.actor ?? "personal_agent",
    action: input.action,
    permissions_used: input.permissionsUsed,
    result: input.result,
    metadata: input.metadata ?? {},
  });
  if (error) console.error(JSON.stringify({ level: "error", msg: "agent_log_failed", code: error.code }));
}

const MODELS = { smart: "claude-sonnet-5-5", fast: "claude-haiku-5-5" } as const;

export async function generateStructured<T>(opts: {
  prompt: string;
  input: unknown;
  schema: ZodSchema<T>;
  system?: string;
  model?: "fast" | "smart";
  maxRetries?: number;
}): Promise<T> {
  if (process.env.MOCK_AI === "1") return opts.schema.parse(await loadFixture(opts.prompt, opts.input));
  const client = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") });
  const tool = { name: "respond", description: "Return the result", input_schema: zodToJsonSchema(opts.schema) };
  let feedback = "";
  for (let attempt = 0; attempt <= (opts.maxRetries ?? 1); attempt++) {
    const started = Date.now();
    const res = await client.messages
      .create({
        model: MODELS[opts.model ?? "smart"],
        max_tokens: 1500,
        system: opts.system,
        tools: [tool as Anthropic.Tool],
        tool_choice: { type: "tool", name: "respond" },
        messages: [{ role: "user", content: JSON.stringify(opts.input) + feedback }],
      })
      .catch(() => null);
    console.info(JSON.stringify({ msg: "ai_call", prompt: opts.prompt, ms: Date.now() - started, usage: res?.usage }));
    const block = res?.content.find((b) => b.type === "tool_use");
    const parsed = opts.schema.safeParse(block?.type === "tool_use" ? block.input : undefined);
    if (parsed.success) return parsed.data;
    feedback = `\n\nYour previous output failed validation: ${parsed.error?.message ?? "no tool call"}`;
  }
  throw new ApiError("AI_UNAVAILABLE", "The assistant is unavailable right now");
}

/**
 * MOCK_AI fixture: `src/lib/ai/fixtures/<prompt>.json`. The top level is the default
 * response (so 01's plain loader works unchanged); an optional `cases` array of
 * `{ match: "<substring of input JSON>", output }` selects a different response.
 */
async function loadFixture(prompt: string, input: unknown): Promise<unknown> {
  const file = path.join(process.cwd(), "src/lib/ai/fixtures", `${prompt}.json`);
  const { cases, ...fallback } = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
  if (!Array.isArray(cases)) return fallback;
  const haystack = JSON.stringify(input).toLowerCase();
  const hit = (cases as { match: string; output: unknown }[]).find((c) => haystack.includes(c.match.toLowerCase()));
  return hit ? hit.output : fallback;
}

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new ApiError("INTERNAL", `Missing environment variable ${name}`);
  return value;
}
