import 'server-only';
import { after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { aiRateLimiter } from '@/lib/api';
import { createAdminClient } from '@/lib/supabase/admin';
import { DEMAND_CONFIG } from './config';
import { generateProposal, generateRevision } from './generate';
import type { GroupRouteDeps } from './group-route';
import type { ReviseRouteDeps } from './revise-route';
import { defaultRouteDeps, type RouteDeps } from './routes';
import { getRunView } from './store-supabase';
import { loadRevisable, revisionSaver } from './store-revise';
import { getGroupVenueRequest } from '@/features/groups';
import { groupProposalSaver, hasPendingGroupProposal, isActiveGroupMember } from './store-group';
import { logActions, notifyOwner } from './core-adapters';
import { findCandidateBusinesses, getVenueForProposal } from '@/features/business';
import { supabaseDeps } from './wiring';

const admin = () => createAdminClient() as unknown as SupabaseClient;

/** Production wiring for the 04 route files. */
export function routeDeps(): RouteDeps {
  return defaultRouteDeps({
    pipeline: () => supabaseDeps(admin()),
    schedule: (task) => after(task),
    getRunView: (runId) => getRunView(admin(), runId),
    group: groupRouteDeps(),
  });
}

function groupRouteDeps(): GroupRouteDeps {
  return {
    isActiveMember: isActiveGroupMember,
    getRequest: getGroupVenueRequest,
    limit: (userId) => aiRateLimiter.assert(userId),
    propose: () => {
      const client = admin();
      return {
        config: DEMAND_CONFIG,
        now: () => new Date(),
        findCandidates: (criteria) => findCandidateBusinesses(criteria, client),
        loadVenue: async (match) => {
          const venue = await getVenueForProposal(match.businessId, client);
          return venue ? { match, card: venue.card, ownerId: venue.ownerId, capabilities: venue.capabilities } : null;
        },
        generate: generateProposal,
        notify: notifyOwner,
        logActions,
        hasPendingGroupProposal: (key) => hasPendingGroupProposal(client, key),
        saveGroupProposal: groupProposalSaver(client),
      };
    },
  };
}

/** Production wiring for `POST /api/ai/proposals/:id/revise`. */
export function reviseRouteDeps(): ReviseRouteDeps {
  return {
    loadRevisable,
    limit: (userId) => aiRateLimiter.assert(userId),
    revise: () => {
      const client = admin();
      return {
        config: DEMAND_CONFIG,
        now: () => new Date(),
        loadVenue: async (businessId) => {
          const venue = await getVenueForProposal(businessId, client);
          // A revision has no candidate match behind it; the venue is already chosen.
          const match = { businessId, name: venue?.card.name ?? '', score: 0, reasons: [] };
          return venue ? { match, card: venue.card, ownerId: venue.ownerId, capabilities: venue.capabilities } : null;
        },
        generate: generateRevision,
        saveRevision: revisionSaver(client),
        logActions,
      };
    },
  };
}
