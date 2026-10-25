import type { GraphEventKind } from '@/shared/schemas/graph';

/**
 * How strong a tie looks, from the provenance log. A sum of what happened between two people,
 * faded by age: a connection made last week pulls harder than one made last year. It sets node
 * size and distance from the centre and is never rendered as a number — it is not a score.
 */

export const STRENGTH = {
  /** Days after which an event contributes 1/e of its weight. */
  halfLifeDays: 45,
  /** Even a cold tie is still a tie, so it never collapses onto the centre. */
  floor: 0.05,
} as const;

export type StrengthEvent = { weight: number; createdAt: string };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Decayed sum of everything that happened between one pair, clamped to [floor, 1]. */
export function edgeStrength(events: readonly StrengthEvent[], now: number): number {
  const total = events.reduce((sum, event) => {
    const ageDays = Math.max(0, (now - Date.parse(event.createdAt)) / DAY_MS);
    return sum + event.weight * Math.exp(-ageDays / STRENGTH.halfLifeDays);
  }, 0);
  return Math.min(1, Math.max(STRENGTH.floor, total));
}

export type ProvenanceRow = {
  actor_id: string;
  subject_id: string;
  kind: GraphEventKind;
  weight: number;
  created_at: string;
};

const other = (row: ProvenanceRow, viewerId: string) =>
  row.actor_id === viewerId ? row.subject_id : row.actor_id;

/** Strength of the viewer's tie to each person who appears in their provenance rows. */
export function strengthByUser(
  viewerId: string,
  rows: readonly ProvenanceRow[],
  now: number,
): Map<string, number> {
  const grouped = new Map<string, StrengthEvent[]>();
  for (const row of rows) {
    const key = other(row, viewerId);
    const list = grouped.get(key);
    const event = { weight: Number(row.weight), createdAt: row.created_at };
    if (list) list.push(event);
    else grouped.set(key, [event]);
  }
  return new Map([...grouped].map(([userId, events]) => [userId, edgeStrength(events, now)]));
}

/** Most recent provenance kind per person, which is what an edge's "why" reads from. */
export function latestProvenance(
  viewerId: string,
  rows: readonly ProvenanceRow[],
): Map<string, GraphEventKind> {
  const latest = new Map<string, { kind: GraphEventKind; at: number }>();
  for (const row of rows) {
    const key = other(row, viewerId);
    const at = Date.parse(row.created_at);
    const seen = latest.get(key);
    if (!seen || at > seen.at) latest.set(key, { kind: row.kind, at });
  }
  return new Map([...latest].map(([userId, value]) => [userId, value.kind]));
}
