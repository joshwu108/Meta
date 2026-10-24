import 'server-only';
import { after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { aiRateLimiter } from '@/lib/api';
import { createAdminClient } from '@/lib/supabase/admin';
import { DEMAND_CONFIG } from './config';
import { generateRevision } from './generate';
import type { ReviseRouteDeps } from './revise-route';
import { defaultRouteDeps, type RouteDeps } from './routes';
import { getRunView } from './store-supabase';
import { loadRevisable, revisionSaver } from './store-revise';
import { stubLoadVenue, stubLogActions } from './stubs';
import { supabaseDeps } from './wiring';

const admin = () => createAdminClient() as unknown as SupabaseClient;

/** Production wiring for the 04 route files. */
export function routeDeps(): RouteDeps {
  return defaultRouteDeps({
    pipeline: () => supabaseDeps(admin()),
    schedule: (task) => after(task),
    getRunView: (runId) => getRunView(admin(), runId),
  });
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
        loadVenue: (businessId) => stubLoadVenue(client, { businessId, name: '', score: 0, reasons: [] }),
        generate: generateRevision,
        saveRevision: revisionSaver(client),
        logActions: (entries) => stubLogActions(client, entries),
      };
    },
  };
}
