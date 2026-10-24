import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { DEMAND_CONFIG } from './config';
import { generateProposal } from './generate';
import { reviseProposal, type ReviseDeps, type ReviseRequest } from './revise';
import { appendRevision, loadProposalForRevision } from './store-revise';
import { stubLoadVenue } from './stubs';

/** Production wiring for revise: `userClient` is the caller's RLS-bound client from withAuth. */
export function reviseDeps(userClient: SupabaseClient, admin: SupabaseClient = createAdminClient() as unknown as SupabaseClient): ReviseDeps {
  return {
    config: DEMAND_CONFIG,
    now: () => new Date(),
    loadProposal: (id) => loadProposalForRevision(userClient, admin, id),
    loadVenue: (businessId) => stubLoadVenue(admin, { businessId, name: '', score: 0, reasons: [] }),
    generate: (input) => generateProposal(input),
    appendRevision: (id, revisions) => appendRevision(admin, id, revisions),
  };
}

export const reviseWith = (userClient: SupabaseClient) => (id: string, request: ReviseRequest) => reviseProposal(id, request, reviseDeps(userClient));
