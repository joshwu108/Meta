/**
 * Public surface of workstream 03's matching feature (README §4). Other features import only
 * from here. Server-only: client components use `./labels` and `./components` instead.
 */
export { getCompatibilityScore, type MatchingPreferences, type ScoreContext } from './server/score';
export { normalizeTag, normalizeTags } from './server/similarity';
export { resolveCategories } from './server/categories';
export { centroid, haversineKm, toLatLng, type LatLng } from './server/geo';
export {
  getMatchesForViewer,
  invalidateMatches,
  type MatchCard,
  type MatchesResult,
  type MatchesStatus,
} from './server/matches';
export { getSuggestedPeople, type SuggestedPerson } from './server/suggested';
export {
  canReach,
  getBlockEdges,
  getBlockedIds,
  getConnectionIds,
  isBlockedEitherWay,
  type BlockEdge,
} from './server/social-graph';
export { getPublicCard, getPublicCards, unknownCard, type PublicCard } from './server/cards';
export {
  getPendingConnectionRequests,
  listConnections,
  type ConnectionItem,
  type PendingConnectionRequest,
} from './server/connections';
export { chunk, ID_FILTER_BATCH, notifySafely } from './server/async';
export { createTtlCache, type TtlCache } from './server/cache';
export type { Actor } from './server/http';
