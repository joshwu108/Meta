import { ok, parseQuery, withAuth } from '@/lib/api';
import { getMatchesForViewer } from '@/features/matching/server/matches';
import { matchesQuerySchema } from '@/shared/schemas/social';

/** GET /api/matches?interest=&goal=&limit=20 — recommended people with scores and explanations. */
export const GET = withAuth(async ({ user }, req) => {
  const query = parseQuery(matchesQuerySchema, req.url);
  const { matches } = await getMatchesForViewer(user.id, query);
  return ok(matches, { total: matches.length, limit: query.limit });
});
