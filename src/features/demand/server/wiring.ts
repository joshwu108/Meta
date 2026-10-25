import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { DEMAND_CONFIG } from './config';
import type { PipelineDeps } from './deps';
import { generateProposal } from './generate';
import * as store from './store-supabase';
import { logActions, notifyOwner } from './core-adapters';
import { getSharablePreferencesBatch } from '@/features/agent';
import { findCandidateBusinesses, getVenueForProposal } from '@/features/business';

/** Production dependencies: service-role Supabase, the real prompt, and 05's venue contracts. */
export function supabaseDeps(admin: SupabaseClient = createAdminClient() as unknown as SupabaseClient): PipelineDeps {
  return {
    config: DEMAND_CONFIG,
    now: () => new Date(),
    startRun: (by) => store.startRun(admin, by),
    updateRun: store.runUpdater(admin),
    listEligibleUserIds: () => store.listEligibleUserIds(admin, DEMAND_CONFIG.pageSize),
    getSharableBatch: (ids) => getSharablePreferencesBatch(ids, 'demand'),
    logActions,
    findCandidates: (criteria) => findCandidateBusinesses(criteria, admin),
    loadVenue: async (match) => {
      const venue = await getVenueForProposal(match.businessId, admin);
      return venue ? { match, card: venue.card, ownerId: venue.ownerId, capabilities: venue.capabilities } : null;
    },
    hasRecentPendingProposal: (sig, since) => store.hasRecentPendingProposal(admin, sig, since),
    generate: generateProposal,
    saveProposal: (input) => store.saveProposal(admin, input),
    notify: notifyOwner,
  };
}
