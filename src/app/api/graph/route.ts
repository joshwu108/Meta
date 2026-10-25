import { ok, parseQuery, withAuth } from '@/lib/api';
import { graphQuerySchema } from '@/features/graph/schemas';
import { getGraphSnapshot } from '@/features/graph/server/snapshot';

/** GET /api/graph?suggestions=0|1 — the viewer's own ego network, nodes and edges. */
export const GET = withAuth(async ({ user }, req) => {
  const { suggestions } = parseQuery(graphQuerySchema, req.url);
  const snapshot = await getGraphSnapshot(user.id, { includeSuggestions: suggestions });
  return ok(snapshot, { total: snapshot.nodes.length });
});
