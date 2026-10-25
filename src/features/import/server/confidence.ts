import type { Band } from '../schemas';
import {
  BAND_SOME,
  BAND_STRONG,
  BAND_WEAK,
  CLOSE_FACTOR,
  MAX_CONFIDENCE,
  W_EXPLORE_CAP,
  W_EXPLORE_PER_TILE,
  W_SUMMARY,
  W_AD_INTEREST,
  W_TOPIC,
} from './weights';

/** Where a candidate trait was seen. `close` marks a model mapping that was not exact. */
export type Evidence =
  | { kind: 'topic'; label: string; state: 'listed' | 'see_more'; close: boolean }
  | { kind: 'summary'; label: string }
  | { kind: 'ad_interest'; label: string; close: boolean }
  | { kind: 'explore'; label: string; tiles: number; close: boolean };

/** Weight of one piece of evidence (spec 07 weights). */
export function evidenceWeight(e: Evidence): number {
  const factor = e.kind !== 'summary' && e.close ? CLOSE_FACTOR : 1;
  if (e.kind === 'topic') return W_TOPIC * factor;
  if (e.kind === 'summary') return W_SUMMARY;
  if (e.kind === 'ad_interest') return W_AD_INTEREST * factor;
  return Math.min(W_EXPLORE_PER_TILE * e.tiles, W_EXPLORE_CAP) * factor;
}

/** 1 − Π(1 − w), capped, rounded to two decimals so it fits numeric(3,2). */
export function confidenceOf(evidence: readonly Evidence[]): number {
  const miss = evidence.reduce((acc, e) => acc * (1 - evidenceWeight(e)), 1);
  return Math.round(Math.min(MAX_CONFIDENCE, 1 - miss) * 100) / 100;
}

/** Band for a confidence, or null when it is too weak to show. */
export function bandOf(confidence: number): Band | null {
  if (confidence >= BAND_STRONG) return 'strong';
  if (confidence >= BAND_SOME) return 'some';
  if (confidence >= BAND_WEAK) return 'weak';
  return null;
}

/** The "Why?" line shown on a card. Labels are what the user's own screenshot showed. */
export function evidenceLine(e: Evidence): string {
  if (e.kind === 'topic') return e.state === 'see_more' ? `You asked Instagram for more "${e.label}"` : `In your Your Algorithm topics: "${e.label}"`;
  if (e.kind === 'summary') return 'Mentioned in your Your Algorithm summary';
  if (e.kind === 'ad_interest') return `In your Instagram ad interests: "${e.label}"`;
  return `Seen in ${e.tiles} Explore ${e.tiles === 1 ? 'tile' : 'tiles'}: "${e.label}"`;
}
