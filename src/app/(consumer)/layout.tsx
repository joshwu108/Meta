import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { AppShell } from '@/features/core/components/app-shell/AppShell';
import { getCurrentUser } from '@/features/core/server/current-user';

/**
 * Consumer frame. `aside` is the `@aside` parallel-route slot: `@aside/default.tsx` renders the
 * agent strip; a page supplies its own rail with `@aside/<route>/page.tsx`.
 */
export default async function ConsumerLayout({ children, aside }: { children: ReactNode; aside: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!user.profile.onboarding_completed_at) redirect('/onboarding');
  return (
    <AppShell mode="consumer" aside={aside}>
      {children}
    </AppShell>
  );
}
