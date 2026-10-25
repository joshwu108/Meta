import { PROVENANCE_LABELS, memberCountLabel, moreLabel } from '../labels';
import { STRENGTH } from './strength';
import type { GraphEdge, GraphInput, GraphNode, GraphSnapshot, GraphStats } from './types';

/**
 * Turns loaded rows into the snapshot the page draws (specs §4). Pure on purpose: every privacy
 * and sizing rule is decided here, where a unit test can hold it to account.
 */

export const GRAPH_LIMITS = {
  maxNodes: 150,
  maxEdges: 400,
  /** Named group members drawn per group; the rest collapse into one anonymous node. */
  groupMembersShown: 8,
} as const;

/** Rank by position in the orbit, so a cap drops the outermost, weakest nodes first. */
const ORDER: Record<GraphNode['state'], number> = {
  me: 0,
  connected: 1,
  context: 2,
  forming: 3,
  suggested: 4,
};

const groupNodeId = (id: string) => `group:${id}`;
const eventNodeId = (id: string) => `event:${id}`;
const moreNodeId = (id: string) => `more:${id}`;

const eventDate = (startsAt: string): string | null => {
  const at = new Date(startsAt);
  return Number.isNaN(at.getTime())
    ? null
    : at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
};

export function assembleGraph(input: GraphInput): GraphSnapshot {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const counted = { connected: 0, forming: 0, suggested: 0, groups: 0, events: 0, hidden: 0 };

  const visible = (userId: string) => !input.blocked.has(userId) && userId !== input.viewer.id;
  const strengthOf = (userId: string) => input.strengthByUser.get(userId) ?? STRENGTH.floor;

  nodes.set(input.viewer.id, {
    id: input.viewer.id,
    kind: 'me',
    state: 'me',
    label: input.viewer.displayName,
    avatarUrl: input.viewer.avatarUrl,
    subtitle: input.viewer.neighborhood,
    agent: false,
    strength: 1,
    count: null,
    href: null,
  });

  const addPerson = (
    userId: string,
    state: GraphNode['state'],
    agent: boolean,
  ): GraphNode | null => {
    if (!visible(userId)) return null;
    const existing = nodes.get(userId);
    if (existing) return existing;
    const person = input.people.get(userId);
    if (!person) return null;
    const node: GraphNode = {
      id: userId,
      kind: 'person',
      state,
      label: person.displayName,
      avatarUrl: person.avatarUrl,
      subtitle: person.neighborhood,
      agent,
      strength: strengthOf(userId),
      count: null,
      href: `/match?focus=${userId}`,
    };
    nodes.set(userId, node);
    return node;
  };

  // --- people the viewer already has an edge with -----------------------------------------
  const byStrength = [...input.connections]
    .filter((connection) => visible(connection.otherId))
    .sort(
      (a, b) =>
        strengthOf(b.otherId) - strengthOf(a.otherId) ||
        (input.people.get(a.otherId)?.displayName ?? '').localeCompare(
          input.people.get(b.otherId)?.displayName ?? '',
        ) ||
        a.otherId.localeCompare(b.otherId),
    );

  for (const connection of byStrength) {
    if (connection.status === 'declined') continue;
    const state = connection.status === 'accepted' ? 'connected' : 'forming';
    const node = addPerson(connection.otherId, state, false);
    if (!node) continue;
    counted[state === 'connected' ? 'connected' : 'forming'] += 1;
    const provenance = input.provenanceByUser.get(connection.otherId) ?? null;
    edges.push({
      id: `c:${connection.id}`,
      source: input.viewer.id,
      target: node.id,
      state,
      provenance,
      why: provenance
        ? PROVENANCE_LABELS[provenance]
        : state === 'forming'
          ? connection.direction === 'incoming'
            ? 'They asked to connect'
            : 'You asked to connect'
          : null,
      strength: node.strength,
    });
  }

  // --- groups, with their members hanging off the group ----------------------------------
  for (const group of input.groups) {
    const members = group.memberIds.filter(visible);
    const shown = members.slice(0, GRAPH_LIMITS.groupMembersShown);
    const node: GraphNode = {
      id: groupNodeId(group.id),
      kind: 'group',
      state: 'context',
      label: group.name,
      avatarUrl: null,
      subtitle: memberCountLabel(group.memberCount),
      agent: false,
      strength: 0.6,
      count: null,
      href: `/groups/${group.id}`,
    };
    nodes.set(node.id, node);
    counted.groups += 1;
    edges.push({
      id: `g:${group.id}`,
      source: input.viewer.id,
      target: node.id,
      state: 'context',
      provenance: null,
      why: 'A group you’re in',
      strength: 0.6,
    });
    for (const memberId of shown) {
      const member = addPerson(memberId, 'context', false);
      if (!member) continue;
      edges.push({
        id: `gm:${group.id}:${memberId}`,
        source: node.id,
        target: member.id,
        state: 'context',
        provenance: 'group_joined',
        why: `Both in ${group.name}`,
        strength: member.strength,
      });
    }
    const hiddenHere = members.length - shown.filter((id) => nodes.has(id)).length;
    if (hiddenHere > 0) {
      counted.hidden += hiddenHere;
      nodes.set(moreNodeId(group.id), {
        id: moreNodeId(group.id),
        kind: 'more',
        state: 'context',
        label: moreLabel(hiddenHere),
        avatarUrl: null,
        subtitle: `In ${group.name}`,
        agent: false,
        strength: 0.2,
        count: hiddenHere,
        href: `/groups/${group.id}`,
      });
      edges.push({
        id: `gmore:${group.id}`,
        source: node.id,
        target: moreNodeId(group.id),
        state: 'context',
        provenance: null,
        why: null,
        strength: 0.2,
      });
    }
  }

  // --- events, linked only to people already on screen ----------------------------------
  for (const event of input.events) {
    const node: GraphNode = {
      id: eventNodeId(event.id),
      kind: 'event',
      state: 'context',
      label: event.title,
      avatarUrl: null,
      subtitle: eventDate(event.startsAt),
      agent: false,
      strength: 0.5,
      count: null,
      href: `/events/${event.id}`,
    };
    nodes.set(node.id, node);
    counted.events += 1;
    edges.push({
      id: `e:${event.id}`,
      source: input.viewer.id,
      target: node.id,
      state: 'context',
      provenance: null,
      why: 'You’re going',
      strength: 0.5,
    });
    for (const attendeeId of event.attendeeIds) {
      if (!nodes.has(attendeeId) || !visible(attendeeId)) continue;
      edges.push({
        id: `ea:${event.id}:${attendeeId}`,
        source: node.id,
        target: attendeeId,
        state: 'context',
        provenance: 'co_attended',
        why: `Both going to ${event.title}`,
        strength: 0.4,
      });
    }
  }

  // --- what the agent found, last so it never overwrites a real tie ----------------------
  for (const suggestion of input.suggestions) {
    if (nodes.has(suggestion.userId)) continue;
    const node = addPerson(suggestion.userId, 'suggested', true);
    if (!node) continue;
    counted.suggested += 1;
    edges.push({
      id: `s:${suggestion.userId}`,
      source: input.viewer.id,
      target: node.id,
      state: 'suggested',
      provenance: 'agent_suggested',
      why: suggestion.explanation,
      strength: node.strength,
    });
  }

  return capped([...nodes.values()], edges, counted, input);
}

/** Keep the graph inside its budget, dropping the outermost and weakest first. */
function capped(
  allNodes: readonly GraphNode[],
  allEdges: readonly GraphEdge[],
  counted: GraphStats,
  input: GraphInput,
): GraphSnapshot {
  const ranked = [...allNodes].sort(
    (a, b) =>
      ORDER[a.state] - ORDER[b.state] || b.strength - a.strength || a.id.localeCompare(b.id),
  );
  const kept = ranked.slice(0, GRAPH_LIMITS.maxNodes);
  const keptIds = new Set(kept.map((node) => node.id));
  const droppedNodes = ranked.length - kept.length;

  const keptEdges = allEdges
    .filter((edge) => keptIds.has(edge.source) && keptIds.has(edge.target))
    .slice(0, GRAPH_LIMITS.maxEdges);

  return {
    generatedAt: new Date(input.now).toISOString(),
    me: input.viewer.id,
    nodes: kept,
    edges: keptEdges,
    stats: { ...counted, hidden: counted.hidden + droppedNodes },
    truncated: droppedNodes > 0 || keptEdges.length < allEdges.length,
  };
}
