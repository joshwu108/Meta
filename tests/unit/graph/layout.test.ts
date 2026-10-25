import { describe, expect, it } from 'vitest';
import {
  GRAPH_VIEWBOX,
  LAYOUT_NODE_LIMIT,
  RING_CAPACITY,
  layoutGraph,
  spreadAngles,
} from '@/features/graph/layout';
import type { GraphSnapshot } from '@/features/graph/server/types';

const node = (id: string, over: Partial<GraphSnapshot['nodes'][number]> = {}) => ({
  id,
  kind: 'person' as const,
  state: 'connected' as const,
  label: id,
  avatarUrl: null,
  subtitle: null,
  agent: false,
  strength: 0.5,
  count: null,
  href: null,
  ...over,
});

const snapshot = (over: Partial<GraphSnapshot> = {}): GraphSnapshot => ({
  generatedAt: '2026-10-25T12:00:00.000Z',
  me: 'me',
  nodes: [node('me', { kind: 'me', state: 'me', strength: 1 })],
  edges: [],
  stats: { connected: 0, forming: 0, suggested: 0, groups: 0, events: 0, hidden: 0 },
  truncated: false,
  ...over,
});

describe('spreadAngles', () => {
  it('keeps a comfortable gap between neighbours', () => {
    const out = spreadAngles([0, 0.01, 0.02], 0.5);
    const sorted = [...out].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i]! - sorted[i - 1]!).toBeGreaterThanOrEqual(0.5 - 1e-9);
    }
  });

  it('falls back to an even ring when the gaps cannot all fit', () => {
    const out = spreadAngles(
      Array.from({ length: 20 }, () => 0),
      1,
    );
    const sorted = [...out].sort((a, b) => a - b);
    const gaps = sorted.slice(1).map((angle, i) => angle - sorted[i]!);
    const even = (Math.PI * 2) / 20;
    for (const gap of gaps) expect(gap).toBeCloseTo(even, 6);
  });

  it('is stable for the same input', () => {
    const desired = [1, 2, 2.05, 4];
    expect(spreadAngles(desired, 0.3)).toEqual(spreadAngles(desired, 0.3));
  });

  it('handles nothing at all', () => {
    expect(spreadAngles([], 0.5)).toEqual([]);
  });
});

describe('layoutGraph', () => {
  it('puts the viewer in the middle and everyone else around them', () => {
    const graph = snapshot({
      nodes: [
        node('me', { kind: 'me', state: 'me', strength: 1 }),
        node('a'),
        node('b'),
        node('c'),
      ],
    });
    const { positions } = layoutGraph(graph);
    const centre = GRAPH_VIEWBOX / 2;
    expect(positions.get('me')).toMatchObject({ x: centre, y: centre });
    for (const id of ['a', 'b', 'c']) {
      const at = positions.get(id)!;
      const distance = Math.hypot(at.x - centre, at.y - centre);
      expect(distance).toBeGreaterThan(50);
      expect(at.x - at.r).toBeGreaterThanOrEqual(0);
      expect(at.x + at.r).toBeLessThanOrEqual(GRAPH_VIEWBOX);
      expect(at.y - at.r).toBeGreaterThanOrEqual(0);
      expect(at.y + at.r).toBeLessThanOrEqual(GRAPH_VIEWBOX);
    }
  });

  it('sizes a node by how strong the tie is, with the viewer the largest', () => {
    const graph = snapshot({
      nodes: [
        node('me', { kind: 'me', state: 'me', strength: 1 }),
        node('close', { strength: 1 }),
        node('far', { strength: 0.05 }),
      ],
    });
    const { positions } = layoutGraph(graph);
    expect(positions.get('close')!.r).toBeGreaterThan(positions.get('far')!.r);
    expect(positions.get('me')!.r).toBeGreaterThan(positions.get('close')!.r);
  });

  it('sits a suggestion further out than a connection', () => {
    const graph = snapshot({
      nodes: [
        node('me', { kind: 'me', state: 'me', strength: 1 }),
        node('friend', { state: 'connected' }),
        node('maybe', { state: 'suggested', agent: true }),
      ],
    });
    const { positions } = layoutGraph(graph);
    const centre = GRAPH_VIEWBOX / 2;
    const distance = (id: string) => {
      const at = positions.get(id)!;
      return Math.hypot(at.x - centre, at.y - centre);
    };
    expect(distance('maybe')).toBeGreaterThan(distance('friend'));
  });

  it('places a group’s members near their group', () => {
    const graph = snapshot({
      nodes: [
        node('me', { kind: 'me', state: 'me', strength: 1 }),
        node('group:g1', { kind: 'group', state: 'context', label: 'Pottery' }),
        node('group:g2', { kind: 'group', state: 'context', label: 'Games' }),
        node('m1', { state: 'context' }),
        node('m2', { state: 'context' }),
      ],
      edges: [
        {
          id: 'e1',
          source: 'group:g1',
          target: 'm1',
          state: 'context',
          provenance: null,
          why: null,
          strength: 0.5,
        },
        {
          id: 'e2',
          source: 'group:g1',
          target: 'm2',
          state: 'context',
          provenance: null,
          why: null,
          strength: 0.5,
        },
      ],
    });
    const { positions } = layoutGraph(graph);
    const centre = GRAPH_VIEWBOX / 2;
    const angle = (id: string) => {
      const at = positions.get(id)!;
      return Math.atan2(at.y - centre, at.x - centre);
    };
    const delta = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    expect(delta(angle('m1'), angle('group:g1'))).toBeLessThan(
      delta(angle('m1'), angle('group:g2')),
    );
  });

  it('keeps a group off the same spoke as a connection', () => {
    const graph = snapshot({
      nodes: [
        node('me', { kind: 'me', state: 'me', strength: 1 }),
        node('tie1'),
        node('tie2'),
        node('group:g1', { kind: 'group', state: 'context' }),
        node('group:g2', { kind: 'group', state: 'context' }),
      ],
    });
    const { positions } = layoutGraph(graph);
    const centre = GRAPH_VIEWBOX / 2;
    const angle = (id: string) => {
      const at = positions.get(id)!;
      return Math.atan2(at.y - centre, at.x - centre);
    };
    const delta = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    for (const group of ['group:g1', 'group:g2']) {
      for (const tie of ['tie1', 'tie2']) {
        expect(delta(angle(group), angle(tie))).toBeGreaterThan(0.3);
      }
    }
  });

  it('never lets two nodes overlap, labels included', () => {
    const graph = snapshot({
      nodes: [
        node('me', { kind: 'me', state: 'me', strength: 1 }),
        ...Array.from({ length: 10 }, (_, i) => node(`tie${i}`, { strength: 0.8 })),
        ...Array.from({ length: 4 }, (_, i) =>
          node(`group:g${i}`, { kind: 'group', state: 'context' }),
        ),
        ...Array.from({ length: 12 }, (_, i) => node(`m${i}`, { state: 'context' })),
        ...Array.from({ length: 6 }, (_, i) => node(`s${i}`, { state: 'suggested', agent: true })),
      ],
      edges: Array.from({ length: 12 }, (_, i) => ({
        id: `e${i}`,
        source: `group:g${i % 4}`,
        target: `m${i}`,
        state: 'context' as const,
        provenance: null,
        why: null,
        strength: 0.5,
      })),
    });
    const { positions } = layoutGraph(graph);
    const entries = [...positions.entries()];
    // A node is a circle plus the name beside it: ~7 units per character at the clipped
    // 12-character maximum, ~20 units tall. Boxes, not circles, are what must not overlap.
    const LABEL_W = 12 * 7;
    const LABEL_H = 20;
    const box = (at: { x: number; y: number; r: number; labelX: number; labelY: number }) => ({
      left: Math.min(at.x - at.r, at.labelX - LABEL_W / 2),
      right: Math.max(at.x + at.r, at.labelX + LABEL_W / 2),
      top: Math.min(at.y - at.r, at.labelY - LABEL_H / 2),
      bottom: Math.max(at.y + at.r, at.labelY + LABEL_H / 2),
    });
    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const [idA, a] = entries[i]!;
        const [idB, b] = entries[j]!;
        const boxA = box(a);
        const boxB = box(b);
        const overlaps =
          boxA.left < boxB.right &&
          boxB.left < boxA.right &&
          boxA.top < boxB.bottom &&
          boxB.top < boxA.bottom;
        expect(overlaps, `${idA} overlaps ${idB}`).toBe(false);
      }
    }
  });

  it('keeps every node and its label inside the viewBox', () => {
    const graph = snapshot({
      nodes: [
        node('me', { kind: 'me', state: 'me', strength: 1 }),
        ...Array.from({ length: 8 }, (_, i) => node(`tie${i}`, { strength: 1 })),
        ...Array.from({ length: 3 }, (_, i) =>
          node(`group:g${i}`, { kind: 'group', state: 'context' }),
        ),
        ...Array.from({ length: 8 }, (_, i) => node(`s${i}`, { state: 'suggested' })),
      ],
    });
    const { positions } = layoutGraph(graph);
    const LABEL_H = 20;
    for (const [id, at] of positions) {
      expect(at.labelY + LABEL_H / 2, `${id} below the frame`).toBeLessThanOrEqual(GRAPH_VIEWBOX);
      expect(at.labelY - LABEL_H / 2, `${id} above the frame`).toBeGreaterThanOrEqual(0);
      expect(at.x - at.r, `${id} left of the frame`).toBeGreaterThanOrEqual(0);
      expect(at.x + at.r, `${id} right of the frame`).toBeLessThanOrEqual(GRAPH_VIEWBOX);
    }
  });

  it('draws only as many nodes as stay readable, closest first', () => {
    const many = Array.from({ length: LAYOUT_NODE_LIMIT + 20 }, (_, i) =>
      node(`p${i}`, { strength: 1 - i / 100 }),
    );
    const graph = snapshot({
      nodes: [node('me', { kind: 'me', state: 'me', strength: 1 }), ...many],
    });
    const { positions } = layoutGraph(graph);
    // All of them are connections, so the ties ring's capacity is what bounds the drawing.
    expect(positions.size).toBe(1 + RING_CAPACITY.ties);
    expect(positions.has('me')).toBe(true);
    expect(positions.has('p0')).toBe(true);
    expect(positions.has(`p${RING_CAPACITY.ties + 1}`)).toBe(false);
  });

  it('fills every ring up to its own capacity', () => {
    const graph = snapshot({
      nodes: [
        node('me', { kind: 'me', state: 'me', strength: 1 }),
        ...Array.from({ length: 20 }, (_, i) => node(`tie${i}`)),
        ...Array.from({ length: 20 }, (_, i) =>
          node(`group:g${i}`, { kind: 'group', state: 'context' }),
        ),
        ...Array.from({ length: 20 }, (_, i) => node(`s${i}`, { state: 'suggested' })),
      ],
    });
    const { positions } = layoutGraph(graph);
    expect(positions.size).toBe(LAYOUT_NODE_LIMIT);
  });

  it('is deterministic, so the graph does not jump between renders', () => {
    const graph = snapshot({
      nodes: [
        node('me', { kind: 'me', state: 'me', strength: 1 }),
        node('a', { strength: 0.9 }),
        node('b', { strength: 0.4 }),
        node('group:g', { kind: 'group', state: 'context' }),
      ],
    });
    const first = layoutGraph(graph);
    const second = layoutGraph(graph);
    expect([...first.positions]).toEqual([...second.positions]);
  });
});
