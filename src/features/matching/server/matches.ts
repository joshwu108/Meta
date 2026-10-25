import 'server-only';
import { getSharablePreferences, getSharablePreferencesBatch } from '@/features/agent';
import { logAgentAction } from '@/features/core';
import { recordGraphEvents } from '@/features/graph';
import type { EventCategory, SocialGoal } from '@/shared/enums';
import type { MatchesQuery } from '@/shared/schemas/social';
import type { AvailabilitySlot, CompatibilityResult } from '@/shared/types';
import { chunk, ID_FILTER_BATCH, mapLimit } from './async';
import { createTtlCache } from './cache';
import { loadCandidateIds } from './candidates';
import { getPublicCards, unknownCard, type PublicCard } from './cards';
import { resolveCategories } from './categories';
import { explainMatch } from './explain';
import { toLatLng } from './geo';
import { getCompatibilityScore, type MatchingPreferences } from './score';
import { loadSemanticScores } from './semantic-load';
import { normalizeTag, normalizeTags } from './similarity';
import { getBlockedIds, getEdgeUserIds } from './social-graph';
import { MATCH_LIMITS } from './weights';

/** One recommended person (spec §6 `MatchCard`). */
export type MatchCard = {
  user: PublicCard;
  score: number;
  breakdown: CompatibilityResult['breakdown'];
  sharedInterests: string[];
  sharedSlots: AvailabilitySlot[];
  explanation: string;
};

/** Why a list is empty, so the page can show the right empty state. */
export type MatchesStatus = 'ok' | 'not_discoverable' | 'no_location' | 'no_candidates';
/** A viewer's recommended people, best first, with the reason when the list is empty. */
export type MatchesResult = { status: MatchesStatus; matches: MatchCard[] };

export type RankedCandidate = { prefs: MatchingPreferences; result: CompatibilityResult };

export type RankOptions = {
  exclude: ReadonlySet<string>;
  interest?: string;
  goal?: SocialGoal;
  limit: number;
  /**
   * Embedding-derived similarity per candidate id. Omitted (or empty) means the interests
   * component stays purely lexical, which is the pre-embeddings behaviour.
   */
  semanticByUserId?: ReadonlyMap<string, number>;
};

function passesFilters(candidate: MatchingPreferences, interest: string | undefined, goal: SocialGoal | undefined): boolean {
  if (goal && !candidate.socialGoals.includes(goal)) return false;
  if (!interest) return true;
  const asCategory = interest.replace(/-/g, '_') as EventCategory;
  return (
    normalizeTags(candidate.interests).includes(interest) ||
    resolveCategories(candidate.interests, candidate.interestCategories).includes(asCategory)
  );
}

function compareRanked(a: RankedCandidate, b: RankedCandidate): number {
  return (
    b.result.score - a.result.score ||
    b.result.sharedInterests.length - a.result.sharedInterests.length ||
    a.prefs.userId.localeCompare(b.prefs.userId)
  );
}

/**
 * Score candidates against the viewer and keep the best `limit`: excluded ids, failed hard filters
 * and zero scores are dropped, optional interest/goal filters apply, ties break deterministically.
 */
export function rankCandidates(
  viewer: MatchingPreferences,
  candidates: readonly MatchingPreferences[],
  opts: RankOptions,
): RankedCandidate[] {
  const interest = opts.interest ? normalizeTag(opts.interest) : undefined;
  return candidates
    .filter((c) => c.userId !== viewer.userId && !opts.exclude.has(c.userId))
    .filter((c) => passesFilters(c, interest, opts.goal))
    .map((prefs) => ({
      prefs,
      result: getCompatibilityScore(viewer, prefs, {
        semanticInterest: opts.semanticByUserId?.get(prefs.userId),
      }),
    }))
    .filter(({ result }) => result.hardFilterFailed === null && result.score > 0)
    .sort(compareRanked)
    .slice(0, opts.limit);
}

/** Explanation calls in flight at once on a cache miss (each may be a model call). */
const EXPLAIN_CONCURRENCY = 5;

/**
 * Consent-gated preferences of every candidate who shares them for matching. 02's batch read puts
 * every id in one `in.(...)` filter and the candidate pool goes up to 500, so it is read in chunks.
 */
export async function loadSharedCandidates(ids: readonly string[]): Promise<MatchingPreferences[]> {
  const maps = await Promise.all(chunk(ids, ID_FILTER_BATCH).map((batch) => getSharablePreferencesBatch(batch, 'matching')));
  return maps.flatMap((map) => [...map.values()]);
}

const cache = createTtlCache<MatchesResult>({ ttlMs: MATCH_LIMITS.cacheTtlMs, maxEntries: 2000 });

/** Drop cached match lists for these viewers (after a connection, block or preference change). */
export function invalidateMatches(...userIds: string[]): void {
  cache.deleteWhere((key) => userIds.some((id) => key.startsWith(`${id}|`)));
}

/**
 * Drop every cached list. Entries are keyed by who is looking, so there is no way to find the
 * lists that *contain* a given person — which is exactly what withdrawing consent to matching
 * has to reach. Consent changes are rare and the cache is a five-minute optimisation, so
 * clearing it is both cheap and the only answer that is certainly right.
 */
export function clearMatchCache(): void {
  cache.clear();
}

async function toMatchCards(viewer: MatchingPreferences, ranked: readonly RankedCandidate[]): Promise<MatchCard[]> {
  const cards = await getPublicCards(ranked.map((r) => r.prefs.userId));
  return mapLimit(ranked, EXPLAIN_CONCURRENCY, async ({ prefs, result }) => ({
    user: cards.get(prefs.userId) ?? unknownCard(prefs.userId),
    score: result.score,
    breakdown: result.breakdown,
    sharedInterests: result.sharedInterests,
    sharedSlots: result.sharedSlots,
    explanation: await explainMatch(viewer, prefs, result),
  }));
}

async function computeMatches(viewerId: string, query: MatchesQuery): Promise<MatchesResult> {
  const viewer = await getSharablePreferences(viewerId, 'matching');
  if (!viewer) return { status: 'not_discoverable', matches: [] };
  const center = toLatLng(viewer.coarseLat, viewer.coarseLng);
  if (!center) return { status: 'no_location', matches: [] };
  const [candidateIds, blocked, edges] = await Promise.all([
    loadCandidateIds(viewerId, center, viewer.travelRadiusKm),
    getBlockedIds(viewerId),
    getEdgeUserIds(viewerId),
  ]);
  const exclude = new Set([...blocked, ...edges]);
  const shared = await loadSharedCandidates(candidateIds.filter((id) => !exclude.has(id)));
  // Semantic similarity from pgvector, so `pottery` and `ceramics` are no longer strangers.
  // Degrades to lexical-only when the vector tables are empty or unreachable.
  const semantic = await loadSemanticScores(viewer, shared);
  const ranked = rankCandidates(viewer, shared, {
    exclude,
    interest: query.interest,
    goal: query.goal,
    limit: query.limit,
    semanticByUserId: semantic.byUserId,
  });
  if (ranked.length === 0) return { status: 'no_candidates', matches: [] };
  const matches = await toMatchCards(viewer, ranked);
  await logAgentAction({
    userId: viewerId,
    actor: 'coordination',
    action: 'score_matches',
    permissionsUsed: ['matching'],
    result: `Ranked ${matches.length} people who share your preferences`,
  });
  // One introduction per person per day, so the graph shows who the agent found rather than how
  // often the list was recomputed.
  await recordGraphEvents(
    matches.map((match) => ({ actorId: viewerId, subjectId: match.user.id, kind: 'agent_suggested' as const })),
  );
  return { status: 'ok', matches };
}

/**
 * Recommended people for a viewer (spec §5): both sides must consent to matching and be
 * discoverable; blocked pairs and anyone with an existing connection row are excluded; hard
 * filters are never compensated by score. Cached per viewer and filter for 5 minutes.
 */
export async function getMatchesForViewer(viewerId: string, query: MatchesQuery): Promise<MatchesResult> {
  const key = `${viewerId}|${query.interest ?? ''}|${query.goal ?? ''}|${query.limit}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const result = await computeMatches(viewerId, query);
  cache.set(key, result);
  return result;
}
