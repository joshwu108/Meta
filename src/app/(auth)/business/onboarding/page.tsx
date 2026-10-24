import { redirect } from 'next/navigation';
import Link from 'next/link';
import { AuthCard } from '@/features/core/components/auth/AuthCard';
import { getCurrentUser } from '@/features/core/server/current-user';

export const metadata = { title: 'Business onboarding' };

/** Placeholder owned by workstream 05. */
export default async function BusinessOnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/business/onboarding');
  if (user.businessId) redirect('/business');
  return (
    <AuthCard title="Set up your venue" subtitle="The business onboarding flow is being built by the business workstream.">
      <p className="text-text-2">
        Once it lands you will describe your space, hours and the kinds of events you can host. <Link href="/discover">Go to the consumer app</Link> in the meantime.
      </p>
    </AuthCard>
  );
}
