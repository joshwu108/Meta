import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { AppShell } from '@/features/core/components/app-shell/AppShell';
import { getCurrentUser } from '@/features/core/server/current-user';
import { AgentAside } from '@/features/core/components/app-shell/AgentAside';

export default async function ConsumerLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!user.profile.onboarding_completed_at) redirect('/onboarding');
  return (
    <AppShell mode="consumer" aside={<AgentAside displayName={user.profile.display_name} />}>
      {children}
    </AppShell>
  );
}
