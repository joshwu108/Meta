import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { DEMAND_CONFIG } from './config';
import type { PipelineDeps } from './deps';
import { generateProposal } from './generate';
import * as store from './store-supabase';
import { logActions, notifyOwner } from './core-adapters';
import { stubFindCandidates, stubLoadVenue, stubSharableBatch } from './stubs';

/** Production dependencies: service-role Supabase, the real prompt, and stubs for unmerged contracts. */
export function supabaseDeps(admin: SupabaseClient = createAdminClient() as unknown as SupabaseClient): PipelineDeps {
  return {
    config: DEMAND_CONFIG,
    now: () => new Date(),
    startRun: (by) => store.startRun(admin, by),
    updateRun: store.runUpdater(admin),
    listEligibleUserIds: () => store.listEligibleUserIds(admin),
    getSharableBatch: (ids) => stubSharableBatch(admin, ids),
    logActions,
    findCandidates: (criteria) => stubFindCandidates(admin, criteria),
    loadVenue: (match) => stubLoadVenue(admin, match),
    hasRecentPendingProposal: (sig, since) => store.hasRecentPendingProposal(admin, sig, since),
    generate: generateProposal,
    saveProposal: (input) => store.saveProposal(admin, input),
    notify: notifyOwner,
  };
}
