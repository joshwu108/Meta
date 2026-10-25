import type { GraphEdge, GraphNode, GraphSnapshot } from './server/types';

/**
 * Where each node sits. An ego network has a shape already — you in the middle, your ties around
 * you, context further out — so this lays nodes out on rings instead of running a force
 * simulation: deterministic (no jitter between renders), cheap on a phone, and it survives
 * `prefers-reduced-motion` without a special case.
 *
 * Everything is in viewBox units; the SVG scales to its container, so no DOM measurement.
 */

/** Square viewBox. The SVG scales, so these numbers never need to match CSS pixels. */
export const GRAPH_VIEWBOX = 760;

/**
 * How many nodes each ring will draw. A name takes far more room along a ring than the circle it
 * sits under, so a ring holds far fewer than the geometry alone suggests; past that the drawing
 * stops being readable however it is arranged. The snapshot is ordered closest-first, so these
 * are the ones worth seeing, and the List view still holds every node.
 */
export const RING_CAPACITY = { ties: 9, context: 12, outer: 14 } as const;

/** Nodes the canvas will draw, the viewer included. */
export const LAYOUT_NODE_LIMIT =
  1 + RING_CAPACITY.ties + RING_CAPACITY.context + RING_CAPACITY.outer;

const CENTRE = GRAPH_VIEWBOX / 2;
const TAU = Math.PI * 2;
/** Start at the top and go clockwise, so the strongest tie is where the eye lands first. */
const START_ANGLE = -Math.PI / 2;

/** Ring radius per orbit, as a fraction of the viewBox. Gaps leave room for a node's label. */
const RINGS = {
  ties: 0.2,
  context: 0.31,
  outer: 0.45,
} as const;

/** How far a child may sit from the node that put it on screen. */
const FAN = 0.8;
/** Minimum angle between one ring's spokes and the next ring's. */
const RING_PHASE = 0.45;

/** A node on its ring, before it is turned into coordinates. */
type Placed = { id: string; angle: number; radius: number; r: number };

export type NodePosition = {
  x: number;
  y: number;
  r: number;
  /** Where the name is drawn: just outside the node, pointing away from the centre. */
  labelX: number;
  labelY: number;
};
export type GraphLayout = { viewBox: number; positions: Map<string, NodePosition> };

/** Drawn radius: the viewer is largest, then by how strong the tie is. */
export function nodeRadius(node: GraphNode): number {
  if (node.kind === 'me') return 32;
  if (node.kind === 'group') return 22;
  if (node.kind === 'event') return 20;
  if (node.kind === 'more') return 15;
  if (node.state === 'connected') return 16 + 10 * clamp01(node.strength);
  return 15;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Nudge angles apart until neighbours are at least `minGap` apart, keeping the order they asked
 * for. When the ring cannot hold them all, it gives up on preferences and spaces them evenly —
 * a readable ring beats a faithful one nobody can read.
 */
export function spreadAngles(desired: readonly number[], minGap: number): number[] {
  const count = desired.length;
  if (count === 0) return [];
  if (count * minGap >= TAU) {
    return desired.map((_, index) => START_ANGLE + (index * TAU) / count);
  }
  const order = desired
    .map((angle, index) => ({ angle: normalize(angle), index }))
    .sort((a, b) => a.angle - b.angle || a.index - b.index);

  const placed = order.map((item) => item.angle);
  // Two sweeps forward and one back settle the common cases without a general solver.
  for (let pass = 0; pass < 2; pass += 1) {
    for (let i = 1; i < placed.length; i += 1) {
      const gap = placed[i]! - placed[i - 1]!;
      if (gap < minGap) placed[i] = placed[i - 1]! + minGap;
    }
    const wrap = placed[0]! + TAU - placed[placed.length - 1]!;
    if (wrap < minGap) {
      const shift = (minGap - wrap) / 2;
      for (let i = placed.length - 1; i > 0; i -= 1) {
        const gap = i === placed.length - 1 ? shift : placed[i + 1]! - placed[i]! - minGap;
        if (gap > 0) placed[i] = placed[i]! - Math.min(shift, gap);
      }
    }
  }
  const out = new Array<number>(count);
  order.forEach((item, position) => (out[item.index] = normalize(placed[position]!)));
  return out;
}

function normalize(angle: number): number {
  const wrapped = angle % TAU;
  return wrapped < 0 ? wrapped + TAU : wrapped;
}

/** Which ring a node belongs on. */
function ringOf(node: GraphNode): keyof typeof RINGS {
  if (node.state === 'connected') return 'ties';
  if (node.kind === 'group' || node.kind === 'event') return 'context';
  return 'outer';
}

/**
 * Angle a node would like: fanned around whatever put it on screen, so a group's members sit
 * beside their group rather than stacked behind it. Nodes with no parent spread evenly from
 * `offset`, which the caller sets to the previous ring's half-step so rings interleave instead
 * of lining up along the same spokes.
 */
function desiredAngles(
  nodes: readonly GraphNode[],
  parentAngles: ReadonlyMap<string, number>,
  edges: readonly GraphEdge[],
  offset: number,
): number[] {
  const parentOf = new Map<string, string>();
  for (const edge of edges) {
    if (parentAngles.has(edge.source) && !parentOf.has(edge.target))
      parentOf.set(edge.target, edge.source);
  }
  const siblings = new Map<string, string[]>();
  for (const node of nodes) {
    const parent = parentOf.get(node.id);
    if (parent === undefined) continue;
    const list = siblings.get(parent);
    if (list) list.push(node.id);
    else siblings.set(parent, [node.id]);
  }
  const orphans = nodes.filter((node) => !parentOf.has(node.id));
  const orphanStep = TAU / Math.max(1, orphans.length);

  return nodes.map((node) => {
    const parent = parentOf.get(node.id);
    const parentAngle = parent === undefined ? undefined : parentAngles.get(parent);
    if (parent !== undefined && parentAngle !== undefined) {
      const group = siblings.get(parent) ?? [node.id];
      const index = group.indexOf(node.id);
      const step = Math.min(FAN, TAU / (group.length + 1));
      // An only child still steps aside, or it sits on its parent's spoke and the two labels
      // land on top of each other.
      if (group.length === 1) return parentAngle + step;
      return parentAngle + (index - (group.length - 1) / 2) * step;
    }
    return START_ANGLE + offset + orphans.indexOf(node) * orphanStep;
  });
}

/**
 * Space one node needs along its ring. The name under a node is wider than the node itself, so
 * the label is what actually decides how many fit — ignore it and names pile on each other.
 */
const footprint = (node: GraphNode) => Math.max(2 * nodeRadius(node) + 8, LABEL_WIDTH + 30);

/** 12 characters at ~7 units each: `GraphNodeShape` clips a longer name. */
const LABEL_WIDTH = 12 * 7;
/** Vertical room a node needs: its circle plus the name beside it. */
const LABEL_HEIGHT = 20;
/** Distance from the edge of a node to the middle of its name. */
const LABEL_OFFSET = 13;

/**
 * Names sit under their node, where a reader expects them. Two names landing on each other is
 * then possible in principle, which is what `relax` is for.
 */
const labelAt = (x: number, y: number, r: number) => ({
  labelX: round(x),
  labelY: round(y + r + LABEL_OFFSET),
});
/** Gap between concentric bands of the same ring. */
const BAND_STEP = 86;

/**
 * Place one ring and return each node's angle, so an outer ring can sit near its parent. A ring
 * that cannot hold everything at its own radius spills into concentric bands rather than letting
 * nodes overlap; the strongest ties stay on the inner band, where the eye goes first.
 */
function placeRing(
  nodes: readonly GraphNode[],
  radius: number,
  desired: readonly number[],
  placed: Placed[],
): { angles: Map<string, number>; nextRadius: number } {
  const angles = new Map<string, number>();
  if (nodes.length === 0) return { angles, nextRadius: radius };

  const widest = Math.max(...nodes.map(footprint));
  const maxRadius = CENTRE - Math.max(...nodes.map(nodeRadius)) - LABEL_OFFSET - LABEL_HEIGHT / 2;
  let index = 0;
  let last = radius;
  for (let band = 0; index < nodes.length; band += 1) {
    const bandRadius = Math.min(radius + band * BAND_STEP, maxRadius);
    const capacity = Math.max(1, Math.floor((TAU * bandRadius) / widest));
    const isLast = bandRadius >= maxRadius;
    const take = nodes.slice(index, isLast ? nodes.length : index + capacity);
    const minGap = Math.min(TAU / take.length, widest / bandRadius);
    const spread = spreadAngles(desired.slice(index, index + take.length), minGap);
    take.forEach((node, offset) => {
      const angle = spread[offset]!;
      angles.set(node.id, angle);
      placed.push({ id: node.id, angle, radius: bandRadius, r: nodeRadius(node) });
    });
    index += take.length;
    last = bandRadius;
  }
  return { angles, nextRadius: last + BAND_STEP };
}

const round = (value: number) => Math.round(value * 100) / 100;

/** The space a node and its name occupy, as a box in viewBox coordinates. */
function boxOf(at: NodePosition): { left: number; right: number; top: number; bottom: number } {
  return {
    left: Math.min(at.x - at.r, at.labelX - LABEL_WIDTH / 2),
    right: Math.max(at.x + at.r, at.labelX + LABEL_WIDTH / 2),
    top: Math.min(at.y - at.r, at.labelY - LABEL_HEIGHT / 2),
    bottom: Math.max(at.y + at.r, at.labelY + LABEL_HEIGHT / 2),
  };
}

const toPosition = (item: Placed): NodePosition => {
  const x = round(CENTRE + item.radius * Math.cos(item.angle));
  const y = round(CENTRE + item.radius * Math.sin(item.angle));
  return { x, y, r: item.r, ...labelAt(x, y, item.r) };
};

const overlapping = (a: NodePosition, b: NodePosition): boolean => {
  const boxA = boxOf(a);
  const boxB = boxOf(b);
  return (
    boxA.left < boxB.right &&
    boxB.left < boxA.right &&
    boxA.top < boxB.bottom &&
    boxB.top < boxA.bottom
  );
};

/** How far a node may be rotated off the angle its ring asked for, per pass. */
const RELAX_STEP = 0.05;
const RELAX_PASSES = 24;

/**
 * Rings place nodes by what they mean; this nudges apart the pairs that still collide, because a
 * name is wider than the node it belongs to and two rings can crowd each other on the same spoke.
 * Nodes only rotate along their own ring, so the meaning of a radius survives.
 */
function relax(placed: readonly Placed[]): Map<string, NodePosition> {
  const items = placed.map((item) => ({ ...item }));
  for (let pass = 0; pass < RELAX_PASSES; pass += 1) {
    const positions = items.map(toPosition);
    let moved = false;
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        if (!overlapping(positions[i]!, positions[j]!)) continue;
        // Rotate the two apart, the outer one less so it does not sweep across the ring.
        const direction = Math.sign(Math.sin(items[j]!.angle - items[i]!.angle)) || 1;
        items[i]!.angle -= (direction * RELAX_STEP * CENTRE) / items[i]!.radius;
        items[j]!.angle += (direction * RELAX_STEP * CENTRE) / items[j]!.radius;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return new Map(items.map((item) => [item.id, toPosition(item)]));
}

/** Rings from the inside out: ties, then the groups and events, then everything forming. */
export function layoutGraph(snapshot: GraphSnapshot): GraphLayout {
  const placed: Placed[] = [];
  const me = snapshot.nodes.find((node) => node.kind === 'me');

  // Each ring takes its own closest few, so a long list of connections never crowds out the
  // groups and the suggestions behind it.
  const inRing = (ring: keyof typeof RINGS) =>
    snapshot.nodes
      .filter((node) => node.kind !== 'me' && ringOf(node) === ring)
      .slice(0, RING_CAPACITY[ring]);

  const ties = inRing('ties');
  const tieRing = placeRing(
    ties,
    GRAPH_VIEWBOX * RINGS.ties,
    ties.map((_, index) => START_ANGLE + (index * TAU) / Math.max(1, ties.length)),
    placed,
  );
  const tieAngles = tieRing.angles;

  // Out of phase with the ring inside it, so a group never lands on a connection's spoke —
  // where that connection's name, which runs outward, would reach into it.
  const contextOffset = Math.max(TAU / Math.max(2, ties.length * 2), RING_PHASE);
  const context = inRing('context');
  // A ring starts outside whatever the ring within it needed, so an overflowing band of
  // connections never lands on top of the groups.
  const contextRing = placeRing(
    context,
    Math.max(GRAPH_VIEWBOX * RINGS.context, tieRing.nextRadius),
    desiredAngles(context, tieAngles, snapshot.edges, contextOffset),
    placed,
  );
  const contextAngles = contextRing.angles;

  const outer = inRing('outer');
  const parentAngles = new Map([...tieAngles, ...contextAngles]);
  placeRing(
    outer,
    Math.max(GRAPH_VIEWBOX * RINGS.outer, contextRing.nextRadius),
    desiredAngles(outer, parentAngles, snapshot.edges, contextOffset / 2),
    placed,
  );

  const positions = relax(placed);
  if (me) {
    const r = nodeRadius(me);
    positions.set(me.id, { x: CENTRE, y: CENTRE, r, ...labelAt(CENTRE, CENTRE, r) });
  }
  return { viewBox: GRAPH_VIEWBOX, positions };
}
