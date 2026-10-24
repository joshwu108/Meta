import 'server-only';
import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';
import type { ProfileRow } from '@/shared/schemas/profile';

export type CurrentUser = {
  id: string;
  email: string | null;
  profile: ProfileRow;
  /** Set when the auth user owns a business (table owned by workstream 05). */
  businessId: string | null;
  /** What the account signed up as; routes owners without a business to business onboarding. */
  signupAs: 'consumer' | 'business';
};

async function findOwnedBusinessId(supabase: SupabaseClient<Database>, userId: string): Promise<string | null> {
  const client = supabase as unknown as SupabaseClient;
  const { data, error } = await client.from('businesses').select('id').eq('owner_id', userId).maybeSingle();
  if (error || !data) return null;
  return (data as { id: string }).id;
}

/**
 * The signed-in user with their profile and, if any, their business id. Memoised per request
 * with React `cache` so layouts and pages can call it freely. Returns null when signed out.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', auth.user.id).maybeSingle();
  if (!profile) return null;
  const businessId = await findOwnedBusinessId(supabase, auth.user.id);
  return {
    id: auth.user.id,
    email: auth.user.email ?? null,
    profile: profile as ProfileRow,
    businessId,
    signupAs: auth.user.user_metadata?.['signup_as'] === 'business' ? 'business' : 'consumer',
  };
});
