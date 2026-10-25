import 'server-only';
import { createTtlCache, getBlockedIds, getMatchesForViewer } from '@/features/matching';
import { log } from '@/lib/log';
import { assembleGraph } from './assemble';
import {
  loadConnections,
  loadEvents,
  loadGroups,
  loadPeople,
  loadProvenance,
  loadViewer,
} from './load';
import { latestProvenance, strengthByUser } from './strength';
import type { GraphSnapshot, GraphSuggestion } from './types';

/**
 * The read side of the connection graph (specs §4). Loads the viewer's own slice of 03's and 06's
 * tables plus their provenance, then hands it all to the pure `assembleGraph`.
 */

/** People the agent found, offered as an outer ring. More than this is noise, not insight. */
export const SUGGESTIONS_SHOWN = 6;
const CACHE_TTL_MS = 60_000;

const cache = createTtlCache<GraphSnapshot>({ ttlMs: CACHE_TTL_MS, maxEntries: 500 });

/** Drop the cached graph for these viewers (after a connection, block or group change). */
export function invalidateGraph(...userIds: string[]): void {
  cache.deleteWhere((key) => userIds.some((id) => key.startsWith(`${id}|`)));
}

export type GraphOptions = { includeSuggestions?: boolean };

/**
 * Suggestions come from 03's matcher, which already requires both sides to consent to matching
 * and excludes blocks and existing edges. A viewer who has not consented simply has no ring.
 */
async function loadSuggestions(viewerId: string): Promise<GraphSuggestion[]> {
  try {
    const result = await getMatchesForViewer(viewerId, { limit: SUGGESTIONS_SHOWN });
    if (result.status !== 'ok') return [];
    return result.matches.map((match) => ({
      userId: match.user.id,
      explanation: match.explanation,
      score: match.score,
    }));
  } catch (error) {
    // The graph is still worth drawing without the agent's ring.
    log.warn('graph.suggestions_failed', { userId: viewerId, error });
    return [];
  }
}

async function computeSnapshot(viewerId: string, opts: GraphOptions): Promise<GraphSnapshot> {
  const now = Date.now();
  const [viewer, blocked, connections, groups, events, provenance, suggestions] = await Promise.all(
    [
      loadViewer(viewerId),
      getBlockedIds(viewerId),
      loadConnections(viewerId),
      loadGroups(viewerId),
      loadEvents(viewerId, now),
      loadProvenance(viewerId, now),
      opts.includeSuggestions === false ? Promise.resolve([]) : loadSuggestions(viewerId),
    ],
  );
  if (!viewer) {
    return {
      generatedAt: new Date(now).toISOString(),
      me: viewerId,
      nodes: [],
      edges: [],
      stats: { connected: 0, forming: 0, suggested: 0, groups: 0, events: 0, hidden: 0 },
      truncated: false,
    };
  }

  const people = await loadPeople([
    ...connections.map((connection) => connection.otherId),
    ...groups.flatMap((group) => group.memberIds),
    ...suggestions.map((suggestion) => suggestion.userId),
  ]);

  return assembleGraph({
    now,
    viewer,
    blocked,
    connections,
    people,
    groups,
    events,
    suggestions,
    strengthByUser: strengthByUser(viewerId, provenance, now),
    provenanceByUser: latestProvenance(viewerId, provenance),
  });
}

/** The viewer's graph, cached for a minute so a tab switch is free. */
export async function getGraphSnapshot(
  viewerId: string,
  opts: GraphOptions = {},
): Promise<GraphSnapshot> {
  const key = `${viewerId}|${opts.includeSuggestions === false ? 'ties' : 'all'}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const snapshot = await computeSnapshot(viewerId, opts);
  cache.set(key, snapshot);
  return snapshot;
}
