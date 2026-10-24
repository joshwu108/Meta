import 'server-only';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import type { BusinessOwnerView } from '@/shared/types';
import { getOwnerBusiness } from './businesses';
import { businessDeps } from './context';
import type { BusinessDeps } from './deps';

/**
 * The guard every `/business` page starts with. No session goes to login; a signed-in
 * account with no business goes to onboarding, which is the only business page that may be
 * reached without one.
 */

export type BusinessPageContext = { deps: BusinessDeps; business: BusinessOwnerView };

export async function requireBusinessPage(): Promise<BusinessPageContext> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect('/login?next=/business');

  const deps = businessDeps(supabase);
  const business = await getOwnerBusiness(deps, data.user.id);
  if (!business) redirect('/business/onboarding');

  return { deps, business };
}

/** For the onboarding page: an owner who already has a business is sent to the dashboard. */
export async function requireOnboardingPage(): Promise<{ userId: string }> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect('/login?next=/business/onboarding');

  const business = await getOwnerBusiness(businessDeps(supabase), data.user.id);
  if (business) redirect('/business');

  return { userId: data.user.id };
}
