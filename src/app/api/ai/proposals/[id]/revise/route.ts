import type { SupabaseClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/api';
import { handleRevise } from '@/features/demand/server/routes';
import { reviseWith } from '@/features/demand/server/revise-wiring';

export const maxDuration = 60;

/** POST /api/ai/proposals/:id/revise (P1): owner asks the AI to redraft with new numbers or a note. */
export const POST = withAuth(async ({ supabase }, req, params) =>
  handleRevise(params['id'], req, reviseWith(supabase as unknown as SupabaseClient)),
);
