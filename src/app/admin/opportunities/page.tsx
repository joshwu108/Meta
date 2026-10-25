import { notFound } from 'next/navigation';
import { serverEnv } from '@/lib/env';
import { OpportunitiesConsole } from '@/features/demand/components/OpportunitiesConsole';
import { DEMAND_CONFIG } from '@/features/demand/server/config';

export const metadata = { title: 'Opportunities' };
export const dynamic = 'force-dynamic';

/** Presenter control panel for Scene 3. Mounted only when DEMO_MODE=1 (spec §7). */
export default function OpportunitiesPage() {
  if (!serverEnv.isDemoMode) notFound();
  return <OpportunitiesConsole minCohortSize={DEMAND_CONFIG.minCohortSize} />;
}
