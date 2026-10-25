import { OnboardingWizard } from '@/features/business/components/OnboardingWizard';
import { requireOnboardingPage } from '@/features/business/server/page-data';

export const dynamic = 'force-dynamic';

/** Business Screen 1 — onboarding. The only business page reachable without a business. */
export default async function BusinessOnboardingPage() {
  await requireOnboardingPage();
  return <OnboardingWizard />;
}
