import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/features/core/server/current-user';

/** `/` routes by session and onboarding state (specs §5). */
export default async function RootPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!user.profile.onboarding_completed_at) redirect(user.businessId ? '/business' : '/onboarding');
  redirect('/discover');
}
