import { NearbyQuery } from "@/features/events/schemas";
import { queryOf } from "@/features/events/server/http";
import { getNearbyBusinesses } from "@/features/events/server/nearby";
import { ok, withAuth } from "@/features/events/server/stubs";

export const GET = withAuth(async ({ user }, req) => {
  const { radiusKm } = NearbyQuery.parse(queryOf(req));
  return ok(await getNearbyBusinesses(user.id, radiusKm));
});
