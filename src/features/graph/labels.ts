import type { GraphEventKind } from '@/shared/schemas/graph';
import type { GraphEdgeState, GraphNodeState } from './server/types';

/** Display strings for the graph. Safe to import from client components. */

/** What an edge says about how two people came to be on the same screen. */
export const PROVENANCE_LABELS: Readonly<Record<GraphEventKind, string>> = {
  agent_suggested: 'Your agent found them',
  request_sent: 'You sent a request',
  accepted: 'You’re connected',
  declined: 'Request declined',
  group_joined: 'Met through a group',
  co_attended: 'Met at an event',
  message_exchanged: 'You’ve been talking',
  left: 'Left a group',
};

export const NODE_STATE_LABELS: Readonly<Record<GraphNodeState, string>> = {
  me: 'You',
  connected: 'Connected',
  forming: 'Forming',
  suggested: 'Suggested',
  context: 'Shared',
};

export const EDGE_STATE_LABELS: Readonly<Record<GraphEdgeState, string>> = {
  connected: 'Connected',
  forming: 'Forming',
  suggested: 'Suggested by your agent',
  context: 'Shared group or event',
};

/** Plural-safe member count for a group node. */
export const memberCountLabel = (count: number): string =>
  `${count} ${count === 1 ? 'member' : 'members'}`;

/** How many people an anonymous node stands for, without naming any of them. */
export const moreLabel = (count: number): string => `+${count} more`;
