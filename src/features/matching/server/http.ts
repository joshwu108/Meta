import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@/lib/api/errors';
import type { Database } from '@/lib/supabase/database.types';
import { uuidSchema } from '@/shared/schemas/common';

/** The signed-in user and their RLS-bound client, as `withAuth` provides them. */
export type Actor = { userId: string; supabase: SupabaseClient<Database> };

/** A path id that must be a uuid. Malformed ids cannot exist, so they read as NOT_FOUND. */
export function pathId(params: Record<string, string>, key: string, what = 'Resource'): string {
  const parsed = uuidSchema.safeParse(params[key]);
  if (!parsed.success) throw new ApiError('NOT_FOUND', `${what} not found`, 404);
  return parsed.data;
}

/** Postgres error codes the social services translate. */
export const PG = { uniqueViolation: '23505' } as const;
