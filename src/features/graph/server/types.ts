import type { GraphEventKind } from '@/shared/schemas/graph';
import type { ConnectionStatus } from '@/shared/enums';

/**
 * Shapes of the connection graph (specs/07-connection-graph/specs.md §4). Nodes and edges are
 * derived from 03's and 06's tables; `graph_edge_events` supplies the provenance and the strength.
 * This file is imported by client components too, so it holds types only.
 */

export type GraphNodeKind = 'me' | 'person' | 'group' | 'event' | 'more';

/** How a node relates to the viewer: `context` is a group member or an event, not a tie. */
export type GraphNodeState = 'me' | 'connected' | 'forming' | 'suggested' | 'context';
export type GraphEdgeState = 'connected' | 'forming' | 'suggested' | 'context';

export type GraphNode = {
  id: string;
  kind: GraphNodeKind;
  state: GraphNodeState;
  label: string;
  /** Profile picture when the person has one; the node falls back to initials. */
  avatarUrl: string | null;
  subtitle: string | null;
  /** True when the agent is why this node is on screen (drawn with the AI gradient ring). */
  agent: boolean;
  /** 0–1, drives node size and how close to the centre it sits. Never shown as a number. */
  strength: number;
  /** People hidden behind an anonymous node. */
  count: number | null;
  /** Where the detail sheet's primary action goes. */
  href: string | null;
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  state: GraphEdgeState;
  provenance: GraphEventKind | null;
  why: string | null;
  strength: number;
};

export type GraphStats = {
  connected: number;
  forming: number;
  suggested: number;
  groups: number;
  events: number;
  /** People left out by the cap or collapsed into an anonymous node. */
  hidden: number;
};

export type GraphSnapshot = {
  generatedAt: string;
  me: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: GraphStats;
  truncated: boolean;
};

/** The public part of a profile, as `profile_public_cards` exposes it. */
export type GraphPerson = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  neighborhood: string | null;
};

export type GraphConnection = {
  id: string;
  otherId: string;
  status: ConnectionStatus;
  direction: 'incoming' | 'outgoing';
};

export type GraphGroup = {
  id: string;
  name: string;
  /** Other active members, already free of blocked people. */
  memberIds: readonly string[];
  memberCount: number;
};

export type GraphEventItem = {
  id: string;
  title: string;
  startsAt: string;
  /** Confirmed attendees other than the viewer. */
  attendeeIds: readonly string[];
};

export type GraphSuggestion = { userId: string; explanation: string; score: number };

/** Everything `assembleGraph` needs, so the assembly itself stays pure and testable. */
export type GraphInput = {
  now: number;
  viewer: GraphPerson;
  blocked: ReadonlySet<string>;
  connections: readonly GraphConnection[];
  people: ReadonlyMap<string, GraphPerson>;
  groups: readonly GraphGroup[];
  events: readonly GraphEventItem[];
  suggestions: readonly GraphSuggestion[];
  strengthByUser: ReadonlyMap<string, number>;
  /** Most recent provenance kind per person, for the edge's "why". */
  provenanceByUser: ReadonlyMap<string, GraphEventKind>;
};
