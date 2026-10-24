import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/features/core/server/current-user';

/** `/` routes by session and onboarding state (specs §5). */
export default async function RootPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.businessId) redirect('/business');
  if (user.signupAs === 'business') redirect('/business/onboarding');
  if (!user.profile.onboarding_completed_at) redirect('/onboarding');
  redirect('/discover');
}
