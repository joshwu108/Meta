import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { getProfileEmbeddings, getTagEmbeddings } from '@/lib/embeddings';
import { nearestConceptPair, semanticInterestSimilarity } from './semantic';
import { normalizeTags } from './similarity';
import type { MatchingPreferences } from './score';

/**
 * Loads the vectors behind semantic matching and reduces them to one number per candidate, so
 * the pure scorer stays free of any database or model concern.
 *
 * Fails soft by design: if the vector tables are empty or unreachable this returns an empty map
 * and every candidate scores purely on exact tags, exactly as before embeddings existed. A
 * semantic bonus is an enhancement, never a dependency.
 */
export type SemanticScores = {
  /** candidate user id -> semantic interest similarity in [0, 1] */
  byUserId: ReadonlyMap<string, number>;
  /** candidate user id -> the nameable pair behind it, for explanations */
  pairByUserId: ReadonlyMap<string, { viewerTag: string; candidateTag: string }>;
};

export const EMPTY_SEMANTIC_SCORES: SemanticScores = { byUserId: new Map(), pairByUserId: new Map() };

export async function loadSemanticScores(
  viewer: MatchingPreferences,
  candidates: readonly MatchingPreferences[],
): Promise<SemanticScores> {
  if (candidates.length === 0) return EMPTY_SEMANTIC_SCORES;
  const admin = createAdminClient() as never;

  const tags = [...new Set([viewer, ...candidates].flatMap((p) => normalizeTags(p.interests)))];
  const [profileVectors, tagVectors] = await Promise.all([
    getProfileEmbeddings(admin, [viewer.userId, ...candidates.map((c) => c.userId)]),
    getTagEmbeddings(admin, tags),
  ]);
  if (profileVectors.size === 0 && tagVectors.size === 0) return EMPTY_SEMANTIC_SCORES;

  const viewerVector = profileVectors.get(viewer.userId);
  const byUserId = new Map<string, number>();
  const pairByUserId = new Map<string, { viewerTag: string; candidateTag: string }>();

  for (const candidate of candidates) {
    const pair = nearestConceptPair(viewer.interests, candidate.interests, tagVectors);
    const score = semanticInterestSimilarity(viewerVector, profileVectors.get(candidate.userId), pair);
    if (score > 0) byUserId.set(candidate.userId, score);
    // Keep the pair only when there is no exact overlap: a shared tag already explains itself.
    if (pair && normalizeTags(viewer.interests).every((t) => !normalizeTags(candidate.interests).includes(t))) {
      pairByUserId.set(candidate.userId, { viewerTag: pair.viewerTag, candidateTag: pair.candidateTag });
    }
  }
  return { byUserId, pairByUserId };
}
