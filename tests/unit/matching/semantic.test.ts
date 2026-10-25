import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { blendInterestScore, cosineOf, nearestConceptPair, semanticInterestSimilarity } = await import(
  '@/features/matching/server/semantic'
);
const { INTEREST_BLEND, SEMANTIC_FLOOR } = await import('@/features/matching/server/weights');

/** Unit vectors in a tiny space, so similarity is exact and readable. */
const unit = (x: number, y: number): number[] => {
  const n = Math.hypot(x, y) || 1;
  return [x / n, y / n];
};

// pottery and ceramics point almost the same way; running is orthogonal.
const vectors = new Map<string, number[]>([
  ['pottery', unit(1, 0)],
  ['ceramics', unit(0.95, 0.31)],
  ['painting', unit(0.8, 0.6)],
  ['running', unit(0, 1)],
]);

describe('cosineOf', () => {
  it('is 1 for the same vector and 0 for orthogonal ones', () => {
    expect(cosineOf(vectors.get('pottery'), vectors.get('pottery'))).toBeCloseTo(1, 5);
    expect(cosineOf(vectors.get('pottery'), vectors.get('running'))).toBeCloseTo(0, 5);
  });

  it('returns 0 rather than throwing on missing or mismatched vectors', () => {
    expect(cosineOf(undefined, vectors.get('pottery'))).toBe(0);
    expect(cosineOf([1, 0, 0], vectors.get('pottery'))).toBe(0);
    expect(cosineOf([], [])).toBe(0);
  });
});

describe('nearestConceptPair', () => {
  it('names the closest pair of real tags from the two profiles', () => {
    // This is what makes a semantic match explainable: both names are real values on the
    // two profiles, so the grounding guard accepts them.
    const pair = nearestConceptPair(['pottery'], ['ceramics', 'running'], vectors);
    expect(pair).toMatchObject({ viewerTag: 'pottery', candidateTag: 'ceramics' });
    expect(pair!.similarity).toBeGreaterThan(SEMANTIC_FLOOR.tag);
  });

  it('ignores an identical tag, which Jaccard already explains', () => {
    expect(nearestConceptPair(['pottery'], ['pottery'], vectors)).toBeNull();
  });

  it('returns null when nothing clears the floor', () => {
    expect(nearestConceptPair(['pottery'], ['running'], vectors)).toBeNull();
  });

  it('returns null when a tag has no embedding', () => {
    expect(nearestConceptPair(['unknown-tag'], ['ceramics'], vectors)).toBeNull();
  });

  it('is stable: the same inputs always name the same pair', () => {
    const a = nearestConceptPair(['pottery', 'painting'], ['ceramics'], vectors);
    const b = nearestConceptPair(['painting', 'pottery'], ['ceramics'], vectors);
    expect(a).toEqual(b);
  });

  it('normalises tags before comparing', () => {
    expect(nearestConceptPair(['Pottery'], ['Ceramics'], vectors)).toMatchObject({
      viewerTag: 'pottery',
      candidateTag: 'ceramics',
    });
  });
});

describe('semanticInterestSimilarity', () => {
  it('falls back to the tag pair when profile similarity is merely average', () => {
    const pair = nearestConceptPair(['pottery'], ['ceramics'], vectors);
    const weakProfiles = semanticInterestSimilarity(vectors.get('pottery'), vectors.get('running'), pair);
    expect(weakProfiles).toBeCloseTo(pair!.similarity, 5);
  });

  it('gates profile similarity by its own, higher floor', () => {
    // Profile cosines sit around 0.59 on real data, so a tag-level floor would let almost
    // every pair collect a bonus. A pair just under the profile floor must score 0.
    const justUnder = SEMANTIC_FLOOR.profile - 0.05;
    const a = [1, 0];
    const b = [Math.cos(Math.acos(justUnder)), Math.sin(Math.acos(justUnder))];
    expect(semanticInterestSimilarity(a, b, null)).toBe(0);
  });

  it('accepts profile similarity above the profile floor', () => {
    const justOver = Math.min(0.99, SEMANTIC_FLOOR.profile + 0.05);
    const a = [1, 0];
    const b = [Math.cos(Math.acos(justOver)), Math.sin(Math.acos(justOver))];
    expect(semanticInterestSimilarity(a, b, null)).toBeCloseTo(justOver, 2);
  });

  it('discards a signal below the floor instead of scaling it', () => {
    expect(semanticInterestSimilarity(vectors.get('pottery'), vectors.get('running'), null)).toBe(0);
  });

  it('is 0 when there are no vectors at all', () => {
    expect(semanticInterestSimilarity(undefined, undefined, null)).toBe(0);
  });
});

describe('blendInterestScore', () => {
  it('returns the lexical score untouched when there is no semantic signal', () => {
    // A missing embedding must not penalise a pair -- the feature degrades, it does not punish.
    expect(blendInterestScore(0.8, 0)).toBeCloseTo(0.8, 5);
  });

  it('lifts a pair that shares no tags but is conceptually close', () => {
    expect(blendInterestScore(0, 0.66)).toBeCloseTo(INTEREST_BLEND.semantic * 0.66, 5);
  });

  it('never exceeds 1, so the 0-100 scale is preserved', () => {
    expect(blendInterestScore(1, 1)).toBeCloseTo(1, 5);
    expect(blendInterestScore(1, 0.9)).toBeLessThanOrEqual(1);
  });

  it('weights lexical above semantic', () => {
    expect(blendInterestScore(1, 0)).toBeGreaterThan(blendInterestScore(0, 1));
  });
});
