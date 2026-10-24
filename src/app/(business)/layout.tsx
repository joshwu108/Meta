import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { AppShell } from '@/features/core/components/app-shell/AppShell';
import { getCurrentUser } from '@/features/core/server/current-user';
import { createServerClient } from '@/lib/supabase/server';
import { businessDeps } from '@/features/business/server/context';
import { countPendingProposals } from '@/features/business/server/proposals';

export default async function BusinessLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/business');
  if (!user.businessId) redirect('/business/onboarding');

  // AppShell reserves the Proposals badge for workstream 05 to supply (spec 05 §7).
  const deps = businessDeps(await createServerClient());
  const proposalsBadge = await countPendingProposals(deps, user.businessId);

  return (
    <AppShell mode="business" proposalsBadge={proposalsBadge}>
      {children}
    </AppShell>
  );
}
