import { BusinessShell } from '@/features/business/components/BusinessShell';
import { EventEditor } from '@/features/business/components/EventEditor';
import { countPendingProposals } from '@/features/business/server/proposals';
import { requireBusinessPage } from '@/features/business/server/page-data';

export const dynamic = 'force-dynamic';

/** Business Screen 4 — create. */
export default async function NewEventPage() {
  const { deps, business } = await requireBusinessPage();
  const pendingCount = await countPendingProposals(deps, business.id);

  return (
    <BusinessShell active="events" businessName={business.name} pendingCount={pendingCount}>
      <EventEditor
        defaultCategory={business.capabilities.eventCategories[0] ?? business.category}
        capacityCeiling={business.capabilities.capacity}
      />
    </BusinessShell>
  );
}
