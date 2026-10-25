import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const agent = {
  getOwnPreferencesForImport: vi.fn(),
  addConfirmedTraits: vi.fn(),
  removeImportedTraits: vi.fn(),
};
vi.mock('@/features/agent', () => agent);
const logAgentAction = vi.fn();
vi.mock('@/features/core', () => ({ logAgentAction }));
const matching = { invalidateMatches: vi.fn(), getConnectionIds: vi.fn(), getSuggestedPeople: vi.fn() };
vi.mock('@/features/matching', async (orig) => ({ ...(await orig<object>()), ...matching }));
const events = { getRecommendedEvents: vi.fn(), getNearbyBusinesses: vi.fn(), getUpcomingEventsForUser: vi.fn() };
vi.mock('@/features/events', () => events);
vi.mock('@/features/groups', () => ({ listMyGroups: vi.fn().mockResolvedValue([]) }));
const repo = {
  countRunsSince: vi.fn(),
  insertRun: vi.fn(),
  deleteExpired: vi.fn(),
  loadExisting: vi.fn(),
  insertSuggestions: vi.fn(),
  loadByIds: vi.fn(),
  applyDecisions: vi.fn(),
  listLovedAndDislikes: vi.fn(),
};
vi.mock('@/features/import/server/repo', () => repo);

/** Minimal chainable stand-in for the admin client used by flag.ts and plan.ts. */
let table: Record<string, unknown> = {};
const upserts: unknown[] = [];
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    Object.assign(chain, {
      from: (name: string) => ((chain.__table = name), chain),
      select: self, eq: self, update: self,
      maybeSingle: async () => ({ data: table[chain.__table as string] ?? null, error: null }),
      single: async () => ({ data: table[chain.__table as string] ?? null, error: null }),
      upsert: async (row: unknown) => (upserts.push(row), { error: null }),
    });
    return chain;
  },
}));

vi.stubEnv('MOCK_AI', '1');
const { runScreensImport, runExportImport } = await import('@/features/import/server/run');
const { decideSuggestions } = await import('@/features/import/server/decide');
const { canUseImport, assertCanUseImport } = await import('@/features/import/server/flag');
const { buildPlan, readPlan } = await import('@/features/import/server/plan');
const { aiRateLimiter } = await import('@/lib/api');

const png = new Uint8Array(readFileSync('tests/fixtures/import/your-algorithm-synthetic.png'));
const USER = '11111111-1111-4111-8111-111111111111';
const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

beforeEach(() => {
  vi.clearAllMocks();
  aiRateLimiter.reset();
  table = {};
  upserts.length = 0;
  agent.getOwnPreferencesForImport.mockResolvedValue({ interests: ['coffee'], activityPrefs: [], dealbreakers: [] });
  repo.countRunsSince.mockResolvedValue(0);
  repo.insertRun.mockResolvedValue('run-1');
  repo.loadExisting.mockImplementation(async (_u, prefs) => ({ ...prefs, pending: new Set(), dislikes: new Set() }));
  repo.insertSuggestions.mockImplementation(async (_u, _r, traits, dislikes) => traits.length + dislikes.length);
});
afterEach(() => vi.unstubAllEnvs());

describe('runScreensImport (MOCK_AI fixture)', () => {
  it('stores suggestions and dislikes, logs counts only, and skips profile values', async () => {
    const result = await runScreensImport(USER, [png], ['your_algorithm']);
    expect(result).toMatchObject({ runId: 'run-1', aiUsed: true });
    expect(result.dropped.sensitive).toBeGreaterThanOrEqual(1);
    const [, , traits, dislikes] = repo.insertSuggestions.mock.calls[0]!;
    const values = traits.map((t: { value: string }) => t.value);
    expect(values).toEqual(expect.arrayContaining(['ceramics', 'pottery', 'board-games', 'hiking']));
    expect(values).not.toContain('coffee');
    expect(dislikes.map((d: { value: string }) => d.value)).toEqual(['horror-movies']);
    const stats = repo.insertRun.mock.calls[0]![3];
    expect(JSON.stringify(stats)).not.toMatch(/[A-Za-z]{3,} [a-z]+/);
    expect(logAgentAction.mock.calls[0]![0].result).toMatch(/^Suggested \d+ traits and 1 dislikes from 1 screenshot you shared$/);
  });

  it('refuses after 10 runs a day and rejects bad files before any AI call', async () => {
    repo.countRunsSince.mockResolvedValue(10);
    await expect(runScreensImport(USER, [png], ['your_algorithm'])).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    await expect(runScreensImport(USER, [new Uint8Array([1, 2, 3])], ['your_algorithm'])).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(repo.insertRun).not.toHaveBeenCalled();
  });

  it('runs export labels through the same pipeline without the vision call', async () => {
    const result = await runExportImport(USER, { topics: ['Ceramics', 'Weight loss'], adInterests: ['Pottery'] });
    expect(result.dropped.sensitive).toBe(1);
    expect(repo.insertRun.mock.calls[0]![1]).toEqual(['export']);
    expect(repo.insertSuggestions.mock.calls[0]![2].map((t: { value: string }) => t.value)).toEqual(['ceramics', 'pottery']);
  });
});

describe('decideSuggestions', () => {
  const rows = [
    { id: id(1), field: 'interests', value: 'ceramics', label: 'Ceramics', status: 'pending' },
    { id: id(2), field: 'dislike', value: 'horror-movies', label: 'Horror movies', status: 'pending' },
  ];

  it('applies decisions, adds approved values through 02 and refreshes matches', async () => {
    repo.loadByIds.mockResolvedValue(rows);
    agent.addConfirmedTraits.mockResolvedValue({ interests: ['coffee', 'ceramics'], activityPrefs: [] });
    const result = await decideSuggestions(USER, { decisions: [{ id: id(1), action: 'love' }, { id: id(2), action: 'keep_dislike' }] });
    expect(result).toEqual({ added: 1, dismissed: 0, dislikes: 1, profile: { interests: ['coffee', 'ceramics'], activityPrefs: [] } });
    expect(repo.applyDecisions).toHaveBeenCalledBefore(agent.addConfirmedTraits);
    expect(agent.addConfirmedTraits).toHaveBeenCalledWith(USER, { interests: ['ceramics'], activityPrefs: [] });
    expect(matching.invalidateMatches).toHaveBeenCalledWith(USER);
  });

  it('checks the 50-interest cap before writing anything', async () => {
    repo.loadByIds.mockResolvedValue(rows);
    agent.getOwnPreferencesForImport.mockResolvedValue({ interests: Array.from({ length: 50 }, (_, i) => `t${i}`), activityPrefs: [], dealbreakers: [] });
    await expect(decideSuggestions(USER, { decisions: [{ id: id(1), action: 'yes' }] })).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(repo.applyDecisions).not.toHaveBeenCalled();
  });

  it('does not touch preferences when nothing is added', async () => {
    repo.loadByIds.mockResolvedValue(rows);
    const result = await decideSuggestions(USER, { decisions: [{ id: id(2), action: 'ignore' }] });
    expect(result).toMatchObject({ added: 0, dismissed: 1, profile: null });
    expect(agent.addConfirmedTraits).not.toHaveBeenCalled();
  });
});

describe('feature gate', () => {
  it('needs IMPORT_ENABLED and an adult-confirmed profile', async () => {
    table = { profiles: { is_adult_confirmed: true } };
    vi.stubEnv('IMPORT_ENABLED', '0');
    expect(await canUseImport(USER)).toBe(false);
    vi.stubEnv('IMPORT_ENABLED', '1');
    expect(await canUseImport(USER)).toBe(true);
    table = { profiles: { is_adult_confirmed: false } };
    await expect(assertCanUseImport(USER)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('plan', () => {
  it('builds from the fixture, stores resolved links and reads done state from real data', async () => {
    agent.getOwnPreferencesForImport.mockResolvedValue({ interests: ['ceramics', 'pottery'], activityPrefs: [], dealbreakers: [] });
    repo.listLovedAndDislikes.mockResolvedValue({ loved: new Set(['ceramics']), dislikes: [] });
    matching.getSuggestedPeople.mockResolvedValue([{ userId: 'u1', displayName: 'Secret Name', avatarUrl: null, neighborhood: 'Mission', explanation: '', score: 80, sharedInterests: ['ceramics'] }]);
    events.getRecommendedEvents.mockResolvedValue([
      { event: { id: 'e1', title: 'Wheel Throwing', category: 'creative', priceCents: 3500, business: { neighborhood: 'Mission' } }, slot: 'thu_eve' },
    ]);
    events.getNearbyBusinesses.mockResolvedValue([{ id: 'b1', name: 'Kiln & Cup', category: 'creative', neighborhood: 'Mission', distanceKm: 1 }]);
    await buildPlan({ userId: USER, supabase: {} as never });
    const saved = upserts[0] as { cards: Array<{ steps: Array<{ href: string; targetId: string }> }>; ai_used: boolean };
    expect(saved.ai_used).toBe(true);
    expect(saved.cards.flatMap((c) => c.steps.map((s) => s.href))).toEqual(['/events/e1', '/match?focus=u1', '/places']);
    expect(logAgentAction.mock.calls.at(-1)![0].result).toMatch(/nothing was booked or sent/);

    table = { import_plans: { cards: saved.cards, done: ['open_place:b1'], ai_used: true, updated_at: 'now' } };
    matching.getConnectionIds.mockResolvedValue(new Set(['u1']));
    events.getUpcomingEventsForUser.mockResolvedValue([]);
    const view = await readPlan(USER);
    expect(view!.cards.map((c) => c.steps[0]!.done)).toEqual([false, true, true]);
  });

  it('falls back without AI when a candidate source fails', async () => {
    vi.stubEnv('MOCK_AI', '0');
    agent.getOwnPreferencesForImport.mockResolvedValue({ interests: [], activityPrefs: [], dealbreakers: [] });
    repo.listLovedAndDislikes.mockResolvedValue({ loved: new Set(), dislikes: [] });
    matching.getSuggestedPeople.mockRejectedValue(new Error('down'));
    events.getRecommendedEvents.mockResolvedValue([]);
    events.getNearbyBusinesses.mockResolvedValue([{ id: 'b1', name: 'Kiln', category: 'creative', neighborhood: null, distanceKm: null }]);
    await buildPlan({ userId: USER, supabase: {} as never });
    const saved = upserts[0] as { cards: Array<{ title: string }>; ai_used: boolean };
    expect(saved.ai_used).toBe(false);
    expect(saved.cards.map((c) => c.title)).toEqual(['Drop by a place nearby']);
  });
});
