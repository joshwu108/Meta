import 'server-only';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/features/core';
import { createServerClient } from '@/lib/supabase/server';
import type { BusinessOwnerView } from '@/shared/types';
import { getOwnerBusiness } from './businesses';
import { businessDeps } from './context';
import type { BusinessDeps } from './deps';

/**
 * What every `/business` page needs. The `(business)` layout has already sent a visitor
 * without a session to login and one without a business to onboarding; this re-reads the
 * user so a page gets the full owner view and its own dependency bundle.
 */

export type BusinessPageContext = { deps: BusinessDeps; business: BusinessOwnerView };

export async function requireBusinessPage(): Promise<BusinessPageContext> {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/business');

  const deps = businessDeps(await createServerClient());
  const business = await getOwnerBusiness(deps, user.id);
  if (!business) redirect('/business/onboarding');

  return { deps, business };
}

/** For the onboarding page: an owner who already has a business goes to the dashboard. */
export async function requireOnboardingPage(): Promise<{ userId: string }> {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/business/onboarding');
  if (user.businessId) redirect('/business');
  return { userId: user.id };
}
