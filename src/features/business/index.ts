import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { BusinessMatch, BusinessPublicCard, VenueCriteria } from '@/shared/types';
import { getBusinessPublicCardFor } from './server/businesses';
import { rankCandidates } from './server/candidates';
import { businessDeps } from './server/context';

/**
 * The public surface of workstream 05. Other features import from here and nothing else
 * (specs/README.md section 1).
 *
 * Both contracts are read-only and are called from server worker code (04's pipeline, 06's
 * feed), so they default to the service-role client; pass a request-scoped client to have
 * RLS apply instead.
 */

/** `getBusinessPublicCard(businessId)` — no owner id, no capability notes, active only. */
export async function getBusinessPublicCard(
  businessId: string,
  db: SupabaseClient = supabaseAdmin(),
): Promise<BusinessPublicCard> {
  return getBusinessPublicCardFor(businessDeps(db), businessId);
}

/**
 * `findCandidateBusinesses(criteria)` — the SQL prefilter from migration 0501 plus 04's
 * weighting (04 section 5.6). At most five matches, best first.
 */
export async function findCandidateBusinesses(
  criteria: VenueCriteria,
  db: SupabaseClient = supabaseAdmin(),
): Promise<BusinessMatch[]> {
  const rows = await businessDeps(db).store.candidateRows({
    category: criteria.category,
    cohortSize: criteria.cohortSize,
    lat: criteria.centerLat,
    lng: criteria.centerLng,
    radiusKm: criteria.radiusKm,
  });
  return rankCandidates(rows, criteria);
}

export { CANDIDATE_WEIGHTS, MAX_CANDIDATES } from './server/candidates';
export { MIN_COHORT_SIZE, toDemandBand } from './server/demand-band';
export { ALLOWED_EVENT_TRANSITIONS, canTransitionEvent } from './server/status-machine';
export { BAND_LABEL, CATEGORY_LABEL, SLOT_LABEL, STATUS_LABEL, demandSentence } from './labels';
export type {
  AttendeeList,
  BusinessCapabilities,
  BusinessEvent,
  BusinessInsights,
  BusinessOwnerView,
  DemandBand,
  EventEdits,
  ProposalDetail,
  ProposalSummary,
} from '@/shared/types';
