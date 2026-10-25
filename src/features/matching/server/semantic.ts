import { INTEREST_BLEND, SEMANTIC_FLOOR } from './weights';
import { clamp01, normalizeTags } from './similarity';

/**
 * The semantic half of the interests score (design: subsystem B).
 *
 * Exact-tag matching scores `pottery` against `ceramics` as zero, so conceptually close people
 * never surface. Embeddings close that gap. The hard part is not the similarity, it is keeping
 * the result *explainable*: this app drops any highlight that is not present verbatim in the
 * input, and rejects a match explanation citing an interest only one side holds. A cosine score
 * is not a reason a person can read.
 *
 * `nearestConceptPair` solves that. When semantic similarity drives a match with no shared tag,
 * it names the closest pair of real tags -- "ceramics <-> pottery" -- both of which genuinely
 * appear on the two profiles. No user is ever shown a number.
 *
 * Every function here is pure: vectors are passed in, so this is testable with no model loaded.
 */

export type Vectors = ReadonlyMap<string, readonly number[]>;

export type ConceptPair = { viewerTag: string; candidateTag: string; similarity: number };

/** Cosine for normalised vectors, clamped. Returns 0 for mismatched or missing vectors. */
export function cosineOf(a: readonly number[] | undefined, b: readonly number[] | undefined): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += (a[i] as number) * (b[i] as number);
  return clamp01(dot);
}

/**
 * The most similar pair of tags across the two profiles, ignoring pairs below `SEMANTIC_FLOOR`
 * and pairs that are the same tag (an exact match is already explained by Jaccard).
 * Ties break alphabetically so the chosen pair is stable between runs.
 */
export function nearestConceptPair(
  viewerInterests: readonly string[],
  candidateInterests: readonly string[],
  vectors: Vectors,
): ConceptPair | null {
  const viewerTags = normalizeTags(viewerInterests);
  const candidateTags = normalizeTags(candidateInterests);
  let best: ConceptPair | null = null;

  for (const viewerTag of viewerTags) {
    const viewerVector = vectors.get(viewerTag);
    if (!viewerVector) continue;
    for (const candidateTag of candidateTags) {
      if (candidateTag === viewerTag) continue;
      const similarity = cosineOf(viewerVector, vectors.get(candidateTag));
      if (similarity < SEMANTIC_FLOOR.tag) continue;
      if (
        !best ||
        similarity > best.similarity ||
        (similarity === best.similarity &&
          `${viewerTag}|${candidateTag}`.localeCompare(`${best.viewerTag}|${best.candidateTag}`) < 0)
      ) {
        best = { viewerTag, candidateTag, similarity };
      }
    }
  }
  return best;
}

/**
 * Semantic similarity for the pair: profile-level cosine when both vectors exist, otherwise the
 * best tag-level pair, otherwise 0. Values below the floor are discarded rather than scaled, so
 * unrelated people gain nothing.
 */
export function semanticInterestSimilarity(
  viewerVector: readonly number[] | undefined,
  candidateVector: readonly number[] | undefined,
  pair: ConceptPair | null,
): number {
  // Each level is gated by its own floor before they compete, so a merely average profile
  // similarity cannot outrank a genuinely close concept pair.
  const profileRaw = cosineOf(viewerVector, candidateVector);
  const profile = profileRaw < SEMANTIC_FLOOR.profile ? 0 : profileRaw;
  const tag = (pair?.similarity ?? 0) < SEMANTIC_FLOOR.tag ? 0 : (pair?.similarity ?? 0);
  return Math.max(profile, tag);
}

/**
 * Blend the lexical and semantic halves. Weights sum to 1, so a pair that is both an exact and
 * a semantic match still tops out at 1 and the overall score stays on its 0-100 scale.
 * With no semantic signal this returns the lexical value unchanged, which is why a missing
 * embedding degrades the score gracefully instead of penalising the pair.
 */
export function blendInterestScore(lexical: number, semantic: number): number {
  if (semantic <= 0) return clamp01(lexical);
  return clamp01(INTEREST_BLEND.lexical * lexical + INTEREST_BLEND.semantic * semantic);
}
