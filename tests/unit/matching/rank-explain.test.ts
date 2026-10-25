import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatchingPreferences } from '@/features/matching/server/score';

vi.mock('server-only', () => ({}));
vi.mock('@/features/core', () => ({ logAgentAction: vi.fn(), notify: vi.fn() }));
const explainRecommendation = vi.fn<(input: unknown) => Promise<string>>();
const getSharablePreferencesBatch = vi.fn<(ids: readonly string[], purpose: string) => Promise<Map<string, MatchingPreferences>>>();
vi.mock('@/features/matching/server/stubs', () => ({
  explainRecommendation: (input: unknown) => explainRecommendation(input),
  getSharablePreferences: vi.fn(),
  getSharablePreferencesBatch: (ids: readonly string[], purpose: string) => getSharablePreferencesBatch(ids, purpose),
}));

const { rankCandidates, loadSharedCandidates } = await import('@/features/matching/server/matches');
const { explainMatch, clearExplanationCache, groundingTerms, isGrounded, templateExplanation, unsharedTerms } = await import('@/features/matching/server/explain');
const { getCompatibilityScore } = await import('@/features/matching/server/score');
const { createTtlCache } = await import('@/features/matching/server/cache');

function prefs(userId: string, overrides: Partial<MatchingPreferences> = {}): MatchingPreferences {
  return {
    userId,
    interests: ['pottery', 'coffee'],
    interestCategories: ['creative', 'food_drink'],
    availabilitySlots: ['thu_eve'],
    socialGoals: ['make_friends'],
    groupSizePref: 'small',
    budgetMin: null,
    budgetMax: 2500,
    travelRadiusKm: 5,
    activityPrefs: ['beginner-friendly'],
    coarseLat: 37.76,
    coarseLng: -122.42,
    neighborhood: 'Mission District',
    ...overrides,
  };
}

const viewer = prefs('viewer');

describe('rankCandidates', () => {
  const candidates = [
    prefs('best'),
    prefs('good', { interests: ['pottery'], interestCategories: ['creative'] }),
    prefs('far', { coarseLat: 38.5 }),
    prefs('blocked'),
    prefs('none', { interests: ['x'], interestCategories: [], availabilitySlots: ['mon_eve'], socialGoals: ['network'], groupSizePref: 'large', activityPrefs: [], budgetMin: 9000, budgetMax: 9999, coarseLat: 37.79, travelRadiusKm: 3 }),
  ];

  it('orders by score, drops hard-filtered and excluded candidates, and respects the limit', () => {
    const ranked = rankCandidates(viewer, candidates, { exclude: new Set(['blocked']), limit: 20 });
    expect(ranked.map((r) => r.prefs.userId)).toEqual(['best', 'good']);
    expect(ranked[0]!.result.score).toBe(100);
    expect(rankCandidates(viewer, candidates, { exclude: new Set(), limit: 1 })).toHaveLength(1);
  });

  it('never ranks the viewer', () => {
    expect(rankCandidates(viewer, [viewer], { exclude: new Set(), limit: 5 })).toEqual([]);
  });

  it('filters by interest tag or category and by social goal', () => {
    const pool = [prefs('a', { interests: ['board-games'], interestCategories: ['games'] }), prefs('b')];
    expect(rankCandidates(viewer, pool, { exclude: new Set(), interest: 'Board Games', limit: 5 }).map((r) => r.prefs.userId)).toEqual(['a']);
    expect(rankCandidates(viewer, pool, { exclude: new Set(), interest: 'creative', limit: 5 }).map((r) => r.prefs.userId)).toEqual(['b']);
    const goals = [prefs('c', { socialGoals: ['network'] }), prefs('d')];
    expect(rankCandidates(viewer, goals, { exclude: new Set(), goal: 'network', limit: 5 }).map((r) => r.prefs.userId)).toEqual(['c']);
  });

  it('breaks score ties by shared interests, then id', () => {
    const tied = [prefs('z'), prefs('y')];
    expect(rankCandidates(viewer, tied, { exclude: new Set(), limit: 5 }).map((r) => r.prefs.userId)).toEqual(['y', 'z']);
  });
});

describe('loadSharedCandidates', () => {
  it('reads consent-gated preferences 100 ids at a time (the gateway rejects ~250 in one filter)', async () => {
    getSharablePreferencesBatch.mockReset();
    getSharablePreferencesBatch.mockImplementation(async (ids) => new Map(ids.filter((id) => id !== 'u7').map((id) => [id, prefs(id)])));
    const ids = Array.from({ length: 250 }, (_, i) => `u${i}`);
    const shared = await loadSharedCandidates(ids);
    expect(getSharablePreferencesBatch.mock.calls.map(([batch, purpose]) => [batch.length, purpose])).toEqual([
      [100, 'matching'],
      [100, 'matching'],
      [50, 'matching'],
    ]);
    expect(shared).toHaveLength(249);
    expect(shared.some((p) => p.userId === 'u7')).toBe(false);
  });
});

describe('explanations', () => {
  beforeEach(() => {
    clearExplanationCache();
    explainRecommendation.mockReset();
  });

  const candidate = prefs('cand', { interests: ['pottery', 'painting'] });
  const result = getCompatibilityScore(viewer, candidate);

  it('builds a template only from shared fields', () => {
    expect(templateExplanation(viewer, candidate, result)).toBe('You both like pottery and are free Thursday evenings.');
    const categoryOnly = prefs('c', { interests: ['ceramics'], interestCategories: ['creative'] });
    expect(templateExplanation(viewer, categoryOnly, getCompatibilityScore(viewer, categoryOnly))).toBe('You both like creative projects and are free Thursday evenings.');
    const noOverlap = prefs('n', { interests: [], interestCategories: [], availabilitySlots: [] });
    const r = getCompatibilityScore(viewer, noOverlap);
    expect(templateExplanation(viewer, noOverlap, r)).toBe('You both want to make friends nearby.');
  });

  it('checks grounding against shared interests, days and goals', () => {
    const terms = groundingTerms(viewer, candidate, result);
    expect(terms).toEqual(expect.arrayContaining(['pottery', 'thursday', 'make friends']));
    expect(isGrounded('Pottery fans who are free on Thursdays', terms)).toBe(true);
    expect(isGrounded('You would love skydiving together', terms)).toBe(false);
    expect(isGrounded('', terms)).toBe(false);
    expect(isGrounded('anything', [])).toBe(true);
  });

  it('rejects answers that name an interest or day the two do not share', async () => {
    // 02's MOCK_AI fixture returns this sentence whenever the input mentions pottery.
    const fixtureText = 'You both love pottery and are free Thursday evenings.';
    const coffeeOnly = prefs('yuki', { interests: ['coffee', 'painting'], interestCategories: ['creative', 'food_drink'] });
    const coffeeResult = getCompatibilityScore(viewer, coffeeOnly);
    expect(unsharedTerms(viewer, coffeeOnly, coffeeResult)).toEqual(expect.arrayContaining(['pottery', 'painting']));
    expect(isGrounded(fixtureText, groundingTerms(viewer, coffeeOnly, coffeeResult), unsharedTerms(viewer, coffeeOnly, coffeeResult))).toBe(false);
    explainRecommendation.mockResolvedValueOnce(fixtureText);
    expect(await explainMatch(viewer, coffeeOnly, coffeeResult)).toBe('You both like coffee and are free Thursday evenings.');

    const potter = prefs('maya', { interests: ['pottery', 'coffee'] });
    const potterResult = getCompatibilityScore(viewer, potter);
    expect(isGrounded(fixtureText, groundingTerms(viewer, potter, potterResult), unsharedTerms(viewer, potter, potterResult))).toBe(true);

    const saturday = prefs('sat', { availabilitySlots: ['thu_eve', 'sat_day'] });
    const satResult = getCompatibilityScore(prefs('v', { availabilitySlots: ['thu_eve'] }), saturday);
    expect(isGrounded('Free on Saturday mornings', ['thursday'], unsharedTerms(prefs('v', { availabilitySlots: ['thu_eve'] }), saturday, satResult))).toBe(false);
  });

  it('uses a grounded AI answer and caches it', async () => {
    explainRecommendation.mockResolvedValue('You both throw pottery on Thursday evenings.');
    expect(await explainMatch(viewer, candidate, result)).toBe('You both throw pottery on Thursday evenings.');
    expect(await explainMatch(viewer, candidate, result)).toBe('You both throw pottery on Thursday evenings.');
    expect(explainRecommendation).toHaveBeenCalledTimes(1);
    const input = explainRecommendation.mock.calls[0]![0] as { target: { kind: string; preferences: { userId: string } } };
    expect(input.target).toMatchObject({ kind: 'person', preferences: { userId: 'cand' } });
  });

  it('falls back to the template when the answer is ungrounded or the call fails', async () => {
    explainRecommendation.mockResolvedValueOnce('Great vibes all around!');
    expect(await explainMatch(viewer, candidate, result)).toBe(templateExplanation(viewer, candidate, result));
    clearExplanationCache();
    explainRecommendation.mockRejectedValueOnce(new Error('AI_UNAVAILABLE'));
    expect(await explainMatch(viewer, candidate, result)).toBe(templateExplanation(viewer, candidate, result));
  });
});

describe('createTtlCache', () => {
  it('expires entries, evicts the oldest past capacity, and deletes by predicate', () => {
    let now = 0;
    const cache = createTtlCache<number>({ ttlMs: 100, maxEntries: 2, now: () => now });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    now = 150;
    expect(cache.get('b')).toBeUndefined();
    cache.set('x|1', 1);
    cache.set('y|1', 2);
    cache.deleteWhere((key) => key.startsWith('x|'));
    expect(cache.get('x|1')).toBeUndefined();
    expect(cache.size()).toBe(1);
  });
});
