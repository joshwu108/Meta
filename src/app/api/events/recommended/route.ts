import { RecommendedQuery } from "@/features/events/schemas";
import { queryOf } from "@/features/events/server/http";
import { getRecommendedEvents } from "@/features/events/server/recommended";
import { ok, withAuth } from "@/features/events/server/stubs";

export const GET = withAuth(async ({ user }, req) => {
  const { limit } = RecommendedQuery.parse(queryOf(req));
  return ok(await getRecommendedEvents(user.id, limit));
});
