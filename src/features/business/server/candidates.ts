import 'server-only';
import type { BusinessMatch, VenueCriteria, WeeklyHours } from '@/shared/types';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { CATEGORY_LABEL, SLOT_LABEL } from '../labels';

/**
 * `findCandidateBusinesses(criteria)` — the contract workstream 04 calls when it has a
 * demand cluster and needs a venue (specs/README.md section 4).
 *
 * 05 owns the query, 04 owns the weighting (04 section 5.6):
 *   category supported (required)
 *   + 0.4 x capacity fit + 0.3 x slot available + 0.2 x proximity + 0.1 x price overlap
 */

export const CANDIDATE_WEIGHTS = {
  capacityFit: 0.4,
  slotAvailable: 0.3,
  proximity: 0.2,
  priceOverlap: 0.1,
} as const;

export const MAX_CANDIDATES = 5;

/** One row of the `business_candidates` SQL prefilter (migration 0501). */
export type CandidateRow = {
  business_id: string;
  name: string;
  category: string;
  neighborhood: string;
  address: string;
  description: string;
  image_url: string | null;
  hours: WeeklyHours;
  capacity: number;
  event_categories: string[];
  hosting_slots: string[];
  equipment_tags: string[];
  formats: string[];
  min_price_cents: number | null;
  max_price_cents: number | null;
  distance_km: number;
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Re-checks in TypeScript what the SQL already filtered, so a caller passing rows from a
 * stub or a fixture gets the same guarantees as one reading the database.
 */
export function acceptsCriteria(row: CandidateRow, criteria: VenueCriteria): boolean {
  if (!row.event_categories.includes(criteria.category)) return false;
  if (row.capacity < criteria.cohortSize) return false;
  if (row.distance_km > criteria.radiusKm) return false;
  return true;
}

/** How much of the venue is used by the cohort: a snug room beats a cavernous one. */
const capacityFit = (row: CandidateRow, criteria: VenueCriteria): number =>
  clamp01(criteria.cohortSize / Math.max(row.capacity, 1));

const slotAvailable = (row: CandidateRow, criteria: VenueCriteria): number => {
  if (row.hosting_slots.length === 0) return 0.5; // no slots published: unknown, not a no
  return row.hosting_slots.includes(criteria.slot) ? 1 : 0;
};

const proximity = (row: CandidateRow, criteria: VenueCriteria): number =>
  criteria.radiusKm <= 0 ? 1 : clamp01(1 - row.distance_km / criteria.radiusKm);

/** The share of the venue's price range that sits inside the cohort's budget. */
const priceOverlap = (row: CandidateRow, criteria: VenueCriteria): number => {
  const { budgetMax } = criteria;
  if (budgetMax === null) return 0.5;
  const min = row.min_price_cents;
  const max = row.max_price_cents;
  if (min === null || max === null) return 0.5;
  if (min > budgetMax) return 0;
  if (max <= budgetMax) return 1;
  return clamp01((budgetMax - min) / Math.max(max - min, 1));
};

function reasonsFor(row: CandidateRow, criteria: VenueCriteria): string[] {
  const category = CATEGORY_LABEL[criteria.category].toLowerCase();
  const reasons = [`Hosts ${category} events`, `Capacity ${row.capacity}`];

  if (row.hosting_slots.includes(criteria.slot)) {
    reasons.push(`Open ${SLOT_LABEL[criteria.slot]}`);
  }
  if (row.distance_km <= 1) {
    reasons.push(`${row.distance_km.toFixed(1)} km from the cluster`);
  }
  if (priceOverlap(row, criteria) === 1 && row.max_price_cents !== null) {
    reasons.push('Price range fits the cohort budget');
  }
  if (row.equipment_tags.length > 0) {
    reasons.push(`Has ${row.equipment_tags.slice(0, 2).join(' and ')}`);
  }
  return reasons;
}

/** A venue scored into the `BusinessMatch` contract: no owner id, no capability notes. */
export function scoreCandidate(row: CandidateRow, criteria: VenueCriteria): BusinessMatch {
  const score =
    CANDIDATE_WEIGHTS.capacityFit * capacityFit(row, criteria) +
    CANDIDATE_WEIGHTS.slotAvailable * slotAvailable(row, criteria) +
    CANDIDATE_WEIGHTS.proximity * proximity(row, criteria) +
    CANDIDATE_WEIGHTS.priceOverlap * priceOverlap(row, criteria);

  return {
    businessId: row.business_id,
    name: row.name,
    score: Number(clamp01(score).toFixed(4)),
    reasons: reasonsFor(row, criteria),
  };
}

/** Best first, nearest to break a tie, then alphabetical. At most `MAX_CANDIDATES`. */
export function rankCandidates(
  rows: readonly CandidateRow[],
  criteria: VenueCriteria,
): BusinessMatch[] {
  const accepted = rows.filter((row) => acceptsCriteria(row, criteria));
  const byId = new Map(accepted.map((row) => [row.business_id, row]));

  return accepted
    .map((row) => scoreCandidate(row, criteria))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const distanceA = byId.get(a.businessId)?.distance_km ?? Number.POSITIVE_INFINITY;
      const distanceB = byId.get(b.businessId)?.distance_km ?? Number.POSITIVE_INFINITY;
      if (distanceA !== distanceB) return distanceA - distanceB;
      return a.name.localeCompare(b.name);
    })
    .slice(0, MAX_CANDIDATES);
}

export type CandidateSource = (criteria: VenueCriteria) => Promise<CandidateRow[]>;

/** Reads the SQL prefilter. Service role: 04 runs the pipeline as a worker, not as a user. */
export const fetchCandidateRows: CandidateSource = async (criteria) => {
  const { data, error } = await supabaseAdmin().rpc('business_candidates', {
    p_category: criteria.category,
    p_cohort_size: criteria.cohortSize,
    p_lat: criteria.centerLat,
    p_lng: criteria.centerLng,
    p_radius_km: criteria.radiusKm,
  });
  if (error) throw new Error(`business_candidates failed: ${error.message}`);
  return (data ?? []) as CandidateRow[];
};

/**
 * The exported contract. `source` is injected in tests and by 04's stub; production passes
 * nothing and reads the database.
 */
export async function findCandidateBusinesses(
  criteria: VenueCriteria,
  source: CandidateSource = fetchCandidateRows,
): Promise<BusinessMatch[]> {
  return rankCandidates(await source(criteria), criteria);
}
