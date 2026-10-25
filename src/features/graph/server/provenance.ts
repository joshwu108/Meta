import 'server-only';
import { log } from '@/lib/log';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Json, TablesInsert } from '@/lib/supabase/database.types';
import {
  graphEventInputSchema,
  type GraphEventInput,
  type GraphEventKind,
  type GraphEventSource,
  type GraphRefTable,
} from '@/shared/schemas/graph';

/**
 * Writes to `graph_edge_events`, the provenance log behind the connection graph. Every caller is a
 * social action that has already been committed, so recording is best-effort: a failure here is
 * logged and never turned into a failed request (the shape of `notifySafely`).
 */

const TABLE = 'graph_edge_events';
const DAY_MS = 24 * 60 * 60 * 1000;

/** Rows written in one call. A single social action can only tell so many stories at once. */
export const MAX_GRAPH_EVENT_BATCH = 25;

type KindDefaults = { source: GraphEventSource; weight: number; refTable: GraphRefTable | null };

/**
 * Defaults per kind. The weights are strength contributions, not scores: accepting a request says
 * much more about a relationship than the agent suggesting it, and a decline or a departure says
 * nothing at all (it stays in the log as a fact, with no pull on the layout).
 */
const KIND_DEFAULTS: Readonly<Record<GraphEventKind, KindDefaults>> = {
  agent_suggested: { source: 'agent', weight: 0.05, refTable: null },
  request_sent: { source: 'user', weight: 0.15, refTable: 'connections' },
  accepted: { source: 'user', weight: 0.5, refTable: 'connections' },
  declined: { source: 'user', weight: 0, refTable: 'connections' },
  group_joined: { source: 'group', weight: 0.25, refTable: 'groups' },
  co_attended: { source: 'event', weight: 0.3, refTable: 'events' },
  message_exchanged: { source: 'user', weight: 0.2, refTable: 'connections' },
  left: { source: 'group', weight: 0, refTable: 'groups' },
};

/**
 * How a repeat is recognised. `ref` kinds happen once per row they point at, whichever side acted
 * (one acceptance per connection, one join per group). `window` kinds repeat forever and are
 * thinned to one per direction per period, so a chatty pair or a re-run of the matcher does not
 * bury the timeline — but each side saying something is still its own moment.
 */
type DedupePolicy = { by: 'ref' } | { by: 'window'; ms: number };

const DEDUPE: Readonly<Record<GraphEventKind, DedupePolicy>> = {
  agent_suggested: { by: 'window', ms: DAY_MS },
  request_sent: { by: 'ref' },
  accepted: { by: 'ref' },
  declined: { by: 'ref' },
  group_joined: { by: 'ref' },
  co_attended: { by: 'ref' },
  message_exchanged: { by: 'window', ms: DAY_MS },
  left: { by: 'ref' },
};

/** An input that passed validation, with the pair normalized the way the table stores it. */
export type NormalizedGraphEvent = {
  actor_id: string;
  subject_id: string;
  kind: GraphEventKind;
  source: GraphEventSource;
  ref_table: GraphRefTable | null;
  ref_id: string | null;
  weight: number;
  metadata: Record<string, unknown>;
  pairLo: string;
  pairHi: string;
};

const clamp = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Validate one input and fill in what the kind implies. Returns null for anything unusable — a
 * self edge, an unknown kind, a malformed id — because a write hook must not care.
 */
export function normalizeGraphEvent(input: GraphEventInput): NormalizedGraphEvent | null {
  const parsed = graphEventInputSchema.safeParse(input);
  if (!parsed.success) return null;
  const { actorId, subjectId, kind, source, refTable, refId, weight, metadata } = parsed.data;
  if (actorId === subjectId) return null;
  const defaults = KIND_DEFAULTS[kind];
  return {
    actor_id: actorId,
    subject_id: subjectId,
    kind,
    source: source ?? defaults.source,
    ref_table: refTable ?? defaults.refTable,
    ref_id: refId ?? null,
    weight: clamp(weight ?? defaults.weight),
    metadata: metadata ?? {},
    pairLo: actorId < subjectId ? actorId : subjectId,
    pairHi: actorId < subjectId ? subjectId : actorId,
  };
}

/** Identity of an event under its own dedupe policy, used to collapse repeats inside a batch. */
function batchKey(event: NormalizedGraphEvent): string {
  return DEDUPE[event.kind].by === 'ref'
    ? `ref|${event.pairLo}|${event.pairHi}|${event.kind}|${event.ref_id ?? ''}`
    : `dir|${event.actor_id}|${event.subject_id}|${event.kind}`;
}

type ExistingRow = {
  actor_id: string;
  subject_id: string;
  pair_lo: string;
  pair_hi: string;
  kind: string;
  ref_id: string | null;
  created_at: string;
};

function isRepeat(
  event: NormalizedGraphEvent,
  existing: readonly ExistingRow[],
  now: number,
): boolean {
  const policy = DEDUPE[event.kind];
  return existing.some((row) => {
    if (row.kind !== event.kind) return false;
    if (policy.by === 'ref') {
      const samePair = row.pair_lo === event.pairLo && row.pair_hi === event.pairHi;
      return samePair && event.ref_id !== null && row.ref_id === event.ref_id;
    }
    const sameDirection = row.actor_id === event.actor_id && row.subject_id === event.subject_id;
    return sameDirection && Date.parse(row.created_at) >= now - policy.ms;
  });
}

/** Oldest moment any policy in this batch still cares about. */
function windowStart(events: readonly NormalizedGraphEvent[], now: number): string {
  const spans = events.map((event) => {
    const policy = DEDUPE[event.kind];
    return policy.by === 'window' ? now - policy.ms : 0;
  });
  return new Date(Math.min(...spans)).toISOString();
}

/** Rows already in the log that could make something in this batch a repeat. */
async function loadExisting(
  events: readonly NormalizedGraphEvent[],
  now: number,
): Promise<ExistingRow[]> {
  const { data, error } = await createAdminClient()
    .from(TABLE)
    .select('actor_id, subject_id, pair_lo, pair_hi, kind, ref_id, created_at')
    .in('pair_lo', [...new Set(events.map((event) => event.pairLo))])
    .in('pair_hi', [...new Set(events.map((event) => event.pairHi))])
    .in('kind', [...new Set(events.map((event) => event.kind))])
    .gte('created_at', windowStart(events, now));
  // Dedupe is a courtesy to the timeline, not a constraint: on a failed read we write anyway
  // rather than lose the event.
  if (error) {
    log.warn('graph.dedupe_read_failed', { error });
    return [];
  }
  return (data ?? []) as ExistingRow[];
}

/**
 * Record several moments in one insert, dropping invalid inputs and repeats. Never throws and
 * never rejects: the caller's social action has already happened.
 */
export async function recordGraphEvents(inputs: readonly GraphEventInput[]): Promise<void> {
  try {
    const normalized = inputs.flatMap((input) => {
      const event = normalizeGraphEvent(input);
      return event ? [event] : [];
    });
    if (normalized.length === 0) return;

    const seen = new Set<string>();
    const unique = normalized.filter((event) => {
      const key = batchKey(event);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const capped = unique.slice(0, MAX_GRAPH_EVENT_BATCH);
    if (capped.length < unique.length) {
      log.warn('graph.batch_capped', {
        dropped: unique.length - capped.length,
        kind: capped[0]?.kind,
      });
    }

    const now = Date.now();
    const existing = await loadExisting(capped, now);
    const fresh = capped.filter((event) => !isRepeat(event, existing, now));
    if (fresh.length === 0) return;

    const { error } = await createAdminClient()
      .from(TABLE)
      .insert(fresh.map((event) => toRow(event)));
    if (error) log.warn('graph.record_failed', { error, kinds: fresh.map((event) => event.kind) });
  } catch (error) {
    log.warn('graph.record_threw', { error });
  }
}

/** The insertable row: `pair_lo` and `pair_hi` are generated columns, so they are left out. */
function toRow(event: NormalizedGraphEvent): TablesInsert<'graph_edge_events'> {
  return {
    actor_id: event.actor_id,
    subject_id: event.subject_id,
    kind: event.kind,
    source: event.source,
    ref_table: event.ref_table,
    ref_id: event.ref_id,
    weight: event.weight,
    metadata: event.metadata as NonNullable<Json>,
  };
}

/** Record one moment. See `recordGraphEvents`. */
export async function recordGraphEvent(input: GraphEventInput): Promise<void> {
  await recordGraphEvents([input]);
}
