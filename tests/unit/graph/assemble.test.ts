import { describe, expect, it } from 'vitest';
import { assembleGraph, GRAPH_LIMITS } from '@/features/graph/server/assemble';
import type { GraphInput, GraphSnapshot } from '@/features/graph/server/types';

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ME = uid(1);
const FRIEND = uid(2);
const PENDING = uid(3);
const SUGGESTED = uid(4);
const CO_MEMBER = uid(5);
const BLOCKED = uid(6);
const NOW = Date.parse('2026-10-25T12:00:00.000Z');

const card = (id: string, name: string, avatarUrl: string | null = null) => ({
  id,
  displayName: name,
  avatarUrl,
  bio: null,
  neighborhood: 'Mission District',
});

function input(overrides: Partial<GraphInput> = {}): GraphInput {
  return {
    now: NOW,
    viewer: card(ME, 'Maya Chen', 'https://cdn.test/maya.jpg'),
    blocked: new Set<string>(),
    connections: [],
    people: new Map(),
    groups: [],
    events: [],
    suggestions: [],
    strengthByUser: new Map(),
    provenanceByUser: new Map(),
    ...overrides,
  };
}

const byId = (snapshot: GraphSnapshot, id: string) => snapshot.nodes.find((node) => node.id === id);

describe('assembleGraph', () => {
  it('puts the viewer at the centre with their own avatar', () => {
    const snapshot = assembleGraph(input());
    expect(snapshot.me).toBe(ME);
    expect(snapshot.nodes[0]).toMatchObject({
      id: ME,
      kind: 'me',
      state: 'me',
      label: 'Maya Chen',
      avatarUrl: 'https://cdn.test/maya.jpg',
    });
    expect(snapshot.edges).toEqual([]);
  });

  it('carries each person’s avatar through, and leaves it null when they have none', () => {
    const snapshot = assembleGraph(
      input({
        connections: [{ id: 'c1', otherId: FRIEND, status: 'accepted', direction: 'outgoing' }],
        people: new Map([[FRIEND, card(FRIEND, 'Leo Park', 'https://cdn.test/leo.png')]]),
      }),
    );
    expect(byId(snapshot, FRIEND)).toMatchObject({
      kind: 'person',
      state: 'connected',
      label: 'Leo Park',
      avatarUrl: 'https://cdn.test/leo.png',
    });

    const without = assembleGraph(
      input({
        connections: [{ id: 'c1', otherId: FRIEND, status: 'accepted', direction: 'outgoing' }],
        people: new Map([[FRIEND, card(FRIEND, 'Leo Park')]]),
      }),
    );
    expect(byId(without, FRIEND)?.avatarUrl).toBeNull();
  });

  it('draws an accepted connection as connected and a pending one as forming', () => {
    const snapshot = assembleGraph(
      input({
        connections: [
          { id: 'c1', otherId: FRIEND, status: 'accepted', direction: 'outgoing' },
          { id: 'c2', otherId: PENDING, status: 'pending', direction: 'outgoing' },
        ],
        people: new Map([
          [FRIEND, card(FRIEND, 'Leo Park')],
          [PENDING, card(PENDING, 'Ana Diaz')],
        ]),
        provenanceByUser: new Map([
          [FRIEND, 'accepted' as const],
          [PENDING, 'request_sent' as const],
        ]),
      }),
    );
    expect(byId(snapshot, FRIEND)?.state).toBe('connected');
    expect(byId(snapshot, PENDING)?.state).toBe('forming');
    const edges = new Map(snapshot.edges.map((edge) => [edge.target, edge]));
    expect(edges.get(FRIEND)).toMatchObject({
      source: ME,
      state: 'connected',
      provenance: 'accepted',
    });
    expect(edges.get(PENDING)).toMatchObject({ state: 'forming', provenance: 'request_sent' });
    expect(edges.get(PENDING)?.why).toBeTruthy();
    expect(snapshot.stats).toMatchObject({ connected: 1, forming: 1 });
  });

  it('marks what the agent found as agent-sourced and suggested', () => {
    const snapshot = assembleGraph(
      input({
        suggestions: [
          { userId: SUGGESTED, explanation: 'You both throw pottery on Thursdays.', score: 82 },
        ],
        people: new Map([[SUGGESTED, card(SUGGESTED, 'Sam Ito')]]),
      }),
    );
    expect(byId(snapshot, SUGGESTED)).toMatchObject({ state: 'suggested', agent: true });
    expect(snapshot.edges[0]).toMatchObject({
      state: 'suggested',
      provenance: 'agent_suggested',
      why: 'You both throw pottery on Thursdays.',
    });
    expect(snapshot.stats.suggested).toBe(1);
  });

  it('never suggests someone already in the graph', () => {
    const snapshot = assembleGraph(
      input({
        connections: [{ id: 'c1', otherId: FRIEND, status: 'accepted', direction: 'outgoing' }],
        suggestions: [{ userId: FRIEND, explanation: 'x', score: 90 }],
        people: new Map([[FRIEND, card(FRIEND, 'Leo Park')]]),
      }),
    );
    expect(snapshot.nodes.filter((node) => node.id === FRIEND)).toHaveLength(1);
    expect(byId(snapshot, FRIEND)?.state).toBe('connected');
    expect(snapshot.stats.suggested).toBe(0);
  });

  it('adds a group with its members, and collapses the rest into one anonymous node', () => {
    const extras = Array.from({ length: GRAPH_LIMITS.groupMembersShown + 3 }, (_, i) =>
      uid(20 + i),
    );
    const snapshot = assembleGraph(
      input({
        groups: [
          { id: 'g1', name: 'Pottery Nights', memberIds: extras, memberCount: extras.length + 1 },
        ],
        people: new Map(extras.map((id, i) => [id, card(id, `Member ${i}`)])),
      }),
    );
    const group = byId(snapshot, 'group:g1');
    expect(group).toMatchObject({ kind: 'group', label: 'Pottery Nights', href: '/groups/g1' });
    expect(group?.subtitle).toContain(String(extras.length + 1));
    const shown = snapshot.nodes.filter(
      (node) => node.kind === 'person' && node.state === 'context',
    );
    expect(shown).toHaveLength(GRAPH_LIMITS.groupMembersShown);
    const halo = byId(snapshot, 'more:g1');
    expect(halo).toMatchObject({ kind: 'more', count: 3, avatarUrl: null });
    expect(halo?.label).not.toContain('Member');
    // Members hang off the group, not off the viewer.
    for (const node of shown) {
      expect(
        snapshot.edges.some((edge) => edge.source === 'group:g1' && edge.target === node.id),
      ).toBe(true);
    }
  });

  it('keeps a group member who is also a connection as the connection', () => {
    const snapshot = assembleGraph(
      input({
        connections: [{ id: 'c1', otherId: CO_MEMBER, status: 'accepted', direction: 'incoming' }],
        groups: [{ id: 'g1', name: 'Pottery Nights', memberIds: [CO_MEMBER], memberCount: 2 }],
        people: new Map([[CO_MEMBER, card(CO_MEMBER, 'Priya Raman')]]),
      }),
    );
    expect(snapshot.nodes.filter((node) => node.id === CO_MEMBER)).toHaveLength(1);
    expect(byId(snapshot, CO_MEMBER)?.state).toBe('connected');
    expect(snapshot.edges.some((edge) => edge.source === ME && edge.target === CO_MEMBER)).toBe(
      true,
    );
    expect(
      snapshot.edges.some((edge) => edge.source === 'group:g1' && edge.target === CO_MEMBER),
    ).toBe(true);
  });

  it('adds an event and links only the people already in the graph', () => {
    const stranger = uid(40);
    const snapshot = assembleGraph(
      input({
        connections: [{ id: 'c1', otherId: FRIEND, status: 'accepted', direction: 'outgoing' }],
        people: new Map([[FRIEND, card(FRIEND, 'Leo Park')]]),
        events: [
          {
            id: 'e1',
            title: 'Wheel throwing for beginners',
            startsAt: '2026-10-29T18:00:00.000Z',
            attendeeIds: [FRIEND, stranger],
          },
        ],
      }),
    );
    expect(byId(snapshot, 'event:e1')).toMatchObject({ kind: 'event', href: '/events/e1' });
    expect(byId(snapshot, stranger)).toBeUndefined();
    expect(
      snapshot.edges.some((edge) => edge.source === 'event:e1' && edge.target === FRIEND),
    ).toBe(true);
    expect(snapshot.stats.events).toBe(1);
  });

  it('removes blocked people before anything counts them', () => {
    const snapshot = assembleGraph(
      input({
        blocked: new Set([BLOCKED]),
        connections: [{ id: 'c1', otherId: BLOCKED, status: 'accepted', direction: 'outgoing' }],
        suggestions: [{ userId: BLOCKED, explanation: 'x', score: 90 }],
        groups: [{ id: 'g1', name: 'Pottery Nights', memberIds: [BLOCKED], memberCount: 2 }],
        people: new Map([[BLOCKED, card(BLOCKED, 'Blocked Person')]]),
      }),
    );
    expect(snapshot.nodes.some((node) => node.id === BLOCKED)).toBe(false);
    expect(snapshot.stats.connected).toBe(0);
    // Not counted into the group's halo either.
    expect(byId(snapshot, 'more:g1')).toBeUndefined();
  });

  it('skips a connection whose profile could not be read', () => {
    const snapshot = assembleGraph(
      input({
        connections: [{ id: 'c1', otherId: FRIEND, status: 'accepted', direction: 'outgoing' }],
      }),
    );
    expect(snapshot.nodes).toHaveLength(1);
    expect(snapshot.stats.connected).toBe(0);
  });

  it('orders connections by strength and sizes them by it', () => {
    const weak = uid(50);
    const snapshot = assembleGraph(
      input({
        connections: [
          { id: 'c1', otherId: weak, status: 'accepted', direction: 'outgoing' },
          { id: 'c2', otherId: FRIEND, status: 'accepted', direction: 'outgoing' },
        ],
        people: new Map([
          [weak, card(weak, 'Weak Tie')],
          [FRIEND, card(FRIEND, 'Close Friend')],
        ]),
        strengthByUser: new Map([
          [weak, 0.1],
          [FRIEND, 0.9],
        ]),
      }),
    );
    const people = snapshot.nodes.filter((node) => node.kind === 'person');
    expect(people.map((node) => node.id)).toEqual([FRIEND, weak]);
    expect(people[0]!.strength).toBeGreaterThan(people[1]!.strength);
  });

  it('caps the graph and says so instead of truncating silently', () => {
    const many = Array.from({ length: GRAPH_LIMITS.maxNodes + 40 }, (_, i) => uid(200 + i));
    const snapshot = assembleGraph(
      input({
        connections: many.map((id, i) => ({
          id: `c${i}`,
          otherId: id,
          status: 'accepted' as const,
          direction: 'outgoing' as const,
        })),
        people: new Map(many.map((id, i) => [id, card(id, `Person ${i}`)])),
        strengthByUser: new Map(many.map((id, i) => [id, i / many.length])),
      }),
    );
    expect(snapshot.nodes.length).toBeLessThanOrEqual(GRAPH_LIMITS.maxNodes);
    expect(snapshot.truncated).toBe(true);
    expect(snapshot.stats.hidden).toBeGreaterThan(0);
    // Whatever survives, no edge may point at a node that did not.
    const ids = new Set(snapshot.nodes.map((node) => node.id));
    for (const edge of snapshot.edges) {
      expect(ids.has(edge.source)).toBe(true);
      expect(ids.has(edge.target)).toBe(true);
    }
  });

  it('is deterministic for the same input', () => {
    const shared = input({
      connections: [
        { id: 'c1', otherId: FRIEND, status: 'accepted', direction: 'outgoing' },
        { id: 'c2', otherId: PENDING, status: 'pending', direction: 'incoming' },
      ],
      people: new Map([
        [FRIEND, card(FRIEND, 'Leo Park')],
        [PENDING, card(PENDING, 'Ana Diaz')],
      ]),
      groups: [{ id: 'g1', name: 'Pottery Nights', memberIds: [FRIEND], memberCount: 2 }],
    });
    expect(JSON.stringify(assembleGraph(shared))).toBe(JSON.stringify(assembleGraph(shared)));
  });
});
