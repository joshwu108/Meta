import { redirect } from 'next/navigation';
import { Bot } from 'lucide-react';
import { AuthCard } from '@/features/core/components/auth/AuthCard';
import { AiRing } from '@/features/core/components/ui/AiRing';
import { getCurrentUser } from '@/features/core/server/current-user';
import { CompleteOnboardingButton } from '@/features/core/components/auth/CompleteOnboardingButton';

export const metadata = { title: 'Onboarding' };

/**
 * Placeholder owned by workstream 02 (conversational onboarding). Until it lands, this page lets a
 * user mark onboarding complete so the rest of the app is reachable.
 */
export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/onboarding');
  if (user.profile.onboarding_completed_at) redirect('/discover');
  return (
    <AuthCard title={`Hi ${user.profile.display_name}`} subtitle="Your agent will ask a few questions to learn what you like and when you're free.">
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <AiRing>
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-pill text-brand-ink">
            <Bot size={28} strokeWidth={1.75} aria-hidden />
          </span>
        </AiRing>
        <p className="text-text-2">The conversational onboarding is being built by the agent workstream. For now you can skip ahead.</p>
        <CompleteOnboardingButton />
      </div>
    </AuthCard>
  );
}
