/**
 * Public surface of workstream 07's graph feature (specs/07-connection-graph/specs.md §10).
 *
 * Deliberately narrow: other features only ever *write* provenance, so only the recorder is
 * exported here. The read side (`server/snapshot.ts`) is consumed by this feature's own routes
 * and pages, which keeps the dependency pointing one way — a snapshot reads 03's and 06's data,
 * while 03 and 06 never import more than the recorder.
 */
export {
  MAX_GRAPH_EVENT_BATCH,
  normalizeGraphEvent,
  recordGraphEvent,
  recordGraphEvents,
  type NormalizedGraphEvent,
} from './server/provenance';
export {
  GRAPH_EVENT_KIND,
  GRAPH_EVENT_SOURCE,
  type GraphEventInput,
  type GraphEventKind,
  type GraphEventSource,
} from '@/shared/schemas/graph';
