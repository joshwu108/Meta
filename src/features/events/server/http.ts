import "server-only";
import { EventIdParams } from "../schemas";
import { withAuth, type AuthCtx } from "./stubs";

/** Route wrapper for /api/events/:id/*: authenticates and validates the event id. */
export function eventRoute(handler: (ctx: AuthCtx, eventId: string, req: Request) => Promise<Response>) {
  return withAuth((ctx, req, params) => handler(ctx, EventIdParams.parse(params).id, req));
}

export function queryOf(req: Request): Record<string, string> {
  return Object.fromEntries(new URL(req.url).searchParams);
}
