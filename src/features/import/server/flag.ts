import 'server-only';
import { ApiError } from '@/lib/api';
import { createAdminClient } from '@/lib/supabase/admin';

/** `IMPORT_ENABLED=1` turns workstream 07 on (default off in production, on locally). */
export function isImportEnabled(): boolean {
  const value = process.env.IMPORT_ENABLED;
  return value === '1' || value === 'true';
}

/** Whether this user may see 07 at all: flag on and `profiles.is_adult_confirmed`. */
export async function canUseImport(userId: string): Promise<boolean> {
  if (!isImportEnabled()) return false;
  const { data, error } = await createAdminClient().from('profiles').select('is_adult_confirmed').eq('id', userId).maybeSingle();
  if (error) throw new ApiError('INTERNAL', 'Failed to load profile', 500, { code: error.code });
  return data?.is_adult_confirmed === true;
}

/** Route guard: `FORBIDDEN` unless the feature is on and the user is adult-confirmed. */
export async function assertCanUseImport(userId: string): Promise<void> {
  if (!(await canUseImport(userId))) throw new ApiError('FORBIDDEN', 'Bringing in your Instagram taste is not available for this account');
}
