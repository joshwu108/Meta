import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ME = uid(1);
const FRIEND = uid(2);
const CANDIDATE = uid(3);

const state = {
  viewer: {
    id: ME,
    displayName: 'Maya Chen',
    avatarUrl: null as string | null,
    bio: null,
    neighborhood: 'Mission',
  } as Record<string, unknown> | null,
  matchesCalls: 0,
  matchesThrows: false,
  loadCalls: 0,
};

vi.mock('@/features/graph/server/load', () => ({
  loadViewer: async () => {
    state.loadCalls += 1;
    return state.viewer;
  },
  loadConnections: async () => [
    { id: 'c1', otherId: FRIEND, status: 'accepted', direction: 'outgoing' },
  ],
  loadGroups: async () => [],
  loadEvents: async () => [],
  loadProvenance: async () => [
    {
      actor_id: ME,
      subject_id: FRIEND,
      kind: 'accepted',
      weight: 0.5,
      created_at: new Date().toISOString(),
    },
  ],
  loadPeople: async (ids: string[]) =>
    new Map(
      ids.map((id) => [
        id,
        {
          id,
          displayName: `Person ${id.slice(-1)}`,
          avatarUrl: null,
          bio: null,
          neighborhood: null,
        },
      ]),
    ),
}));

vi.mock('@/features/matching', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getBlockedIds: async () => new Set<string>(),
  getMatchesForViewer: async () => {
    state.matchesCalls += 1;
    if (state.matchesThrows) throw new Error('matcher down');
    return {
      status: 'ok',
      matches: [{ user: { id: CANDIDATE }, score: 80, explanation: 'Both free on Thursdays.' }],
    };
  },
}));

const { getGraphSnapshot, invalidateGraph } = await import('@/features/graph/server/snapshot');

beforeEach(() => {
  invalidateGraph(ME);
  state.viewer = {
    id: ME,
    displayName: 'Maya Chen',
    avatarUrl: null,
    bio: null,
    neighborhood: 'Mission',
  };
  state.matchesCalls = 0;
  state.matchesThrows = false;
  state.loadCalls = 0;
});

describe('getGraphSnapshot', () => {
  it('assembles the viewer, their ties and the agent’s suggestions', async () => {
    const snapshot = await getGraphSnapshot(ME);
    expect(snapshot.me).toBe(ME);
    expect(snapshot.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining([ME, FRIEND, CANDIDATE]),
    );
    expect(snapshot.stats).toMatchObject({ connected: 1, suggested: 1 });
    expect(snapshot.edges.find((edge) => edge.target === CANDIDATE)).toMatchObject({
      state: 'suggested',
      why: 'Both free on Thursdays.',
    });
  });

  it('serves the next read from cache, and loads again once invalidated', async () => {
    await getGraphSnapshot(ME);
    await getGraphSnapshot(ME);
    expect(state.loadCalls).toBe(1);
    invalidateGraph(ME);
    await getGraphSnapshot(ME);
    expect(state.loadCalls).toBe(2);
  });

  it('caches the ties-only view separately from the full one', async () => {
    const ties = await getGraphSnapshot(ME, { includeSuggestions: false });
    expect(ties.stats.suggested).toBe(0);
    expect(state.matchesCalls).toBe(0);
    const full = await getGraphSnapshot(ME);
    expect(full.stats.suggested).toBe(1);
  });

  it('still draws the graph when the matcher fails', async () => {
    state.matchesThrows = true;
    const snapshot = await getGraphSnapshot(ME);
    expect(snapshot.stats.connected).toBe(1);
    expect(snapshot.stats.suggested).toBe(0);
  });

  it('returns an empty graph when the profile cannot be read', async () => {
    state.viewer = null;
    const snapshot = await getGraphSnapshot(ME);
    expect(snapshot.nodes).toEqual([]);
    expect(snapshot.edges).toEqual([]);
    expect(snapshot.stats.connected).toBe(0);
  });
});
