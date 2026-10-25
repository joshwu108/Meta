import { z } from 'zod';
import { isoTimestampSchema, uuidSchema } from './common';

/**
 * Workstream 07 schemas (specs/07-connection-graph/specs.md §3). `graph_edge_events` is the
 * append-only provenance log behind the connection graph: every row is one moment in the story of
 * a pair of people. Nodes and edges themselves are derived from 03's and 06's tables.
 */

export const GRAPH_EVENT_KIND = [
  'agent_suggested',
  'request_sent',
  'accepted',
  'declined',
  'group_joined',
  'co_attended',
  'message_exchanged',
  'left',
] as const;
export const GRAPH_EVENT_SOURCE = ['agent', 'user', 'group', 'event'] as const;
export const GRAPH_REF_TABLE = ['connections', 'groups', 'events'] as const;

export const graphEventKindSchema = z.enum(GRAPH_EVENT_KIND);
export const graphEventSourceSchema = z.enum(GRAPH_EVENT_SOURCE);
export const graphRefTableSchema = z.enum(GRAPH_REF_TABLE);

export type GraphEventKind = z.infer<typeof graphEventKindSchema>;
export type GraphEventSource = z.infer<typeof graphEventSourceSchema>;
export type GraphRefTable = z.infer<typeof graphRefTableSchema>;

/** Strength contribution of a single event, matching `numeric(4,3)` clamped to [0, 1]. */
export const graphWeightSchema = z.number().min(0).max(1);

export const graphEdgeEventRowSchema = z.object({
  id: uuidSchema,
  actor_id: uuidSchema,
  subject_id: uuidSchema,
  pair_lo: uuidSchema,
  pair_hi: uuidSchema,
  kind: graphEventKindSchema,
  source: graphEventSourceSchema,
  ref_table: graphRefTableSchema.nullable(),
  ref_id: uuidSchema.nullable(),
  weight: z.coerce.number(),
  metadata: z.record(z.unknown()),
  created_at: isoTimestampSchema,
});
export type GraphEdgeEventRow = z.infer<typeof graphEdgeEventRowSchema>;

/**
 * What a caller passes to `recordGraphEvent`. `source`, `refTable` and `weight` default from the
 * kind, so a write hook only states who did what to whom.
 */
export const graphEventInputSchema = z.object({
  actorId: uuidSchema,
  subjectId: uuidSchema,
  kind: graphEventKindSchema,
  source: graphEventSourceSchema.optional(),
  refTable: graphRefTableSchema.optional(),
  refId: uuidSchema.optional(),
  weight: z.number().finite().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type GraphEventInput = z.input<typeof graphEventInputSchema>;
