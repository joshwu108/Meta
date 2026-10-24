import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@/lib/api/errors';
import type { Database } from '@/lib/supabase/database.types';
import type { ProfileRow, ProfileUpdate } from '@/shared/schemas/profile';

type Client = SupabaseClient<Database>;

/** Load the signed-in user's own profile row. */
export async function getOwnProfile(supabase: Client, userId: string): Promise<ProfileRow> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw new ApiError('INTERNAL', 'Could not load profile', 500);
  if (!data) throw new ApiError('NOT_FOUND', 'Profile not found', 404);
  return data as ProfileRow;
}

/** Apply a validated `PATCH /api/me` body. RLS guarantees only the owner can update. */
export async function updateOwnProfile(supabase: Client, userId: string, patch: ProfileUpdate): Promise<ProfileRow> {
  const { data, error } = await supabase.from('profiles').update(patch).eq('id', userId).select('*').maybeSingle();
  if (error) {
    if (error.code === '23514') throw new ApiError('VALIDATION', 'Profile values out of range', 400);
    throw new ApiError('INTERNAL', 'Could not update profile', 500);
  }
  if (!data) throw new ApiError('NOT_FOUND', 'Profile not found', 404);
  return data as ProfileRow;
}
