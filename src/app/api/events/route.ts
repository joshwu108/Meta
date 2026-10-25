import { EventsQuery } from "@/features/events/schemas";
import { listEventFeed } from "@/features/events/server/feed";
import { queryOf } from "@/features/events/server/http";
import { ok, withAuth } from "@/features/events/server/stubs";

export const GET = withAuth(async ({ user }, req) => {
  const page = await listEventFeed(user.id, EventsQuery.parse(queryOf(req)));
  return ok(page.items, { total: page.total, page: page.page, limit: page.limit });
});
