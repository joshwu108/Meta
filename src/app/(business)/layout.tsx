import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { AppShell } from '@/features/core/components/app-shell/AppShell';
import { getCurrentUser } from '@/features/core/server/current-user';

export default async function BusinessLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/business');
  if (!user.businessId) redirect('/business/onboarding');
  return <AppShell mode="business">{children}</AppShell>;
}
