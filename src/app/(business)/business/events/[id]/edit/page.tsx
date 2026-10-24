import { notFound } from 'next/navigation';
import { ApiError } from '@/lib/api/errors';
import { BusinessShell } from '@/features/business/components/BusinessShell';
import { EventEditor } from '@/features/business/components/EventEditor';
import { getBusinessEvent } from '@/features/business/server/events';
import { countPendingProposals } from '@/features/business/server/proposals';
import { requireBusinessPage } from '@/features/business/server/page-data';

export const dynamic = 'force-dynamic';

/** Business Screen 4 — edit. */
export default async function EditEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cancel?: string }>;
}) {
  const { deps, business } = await requireBusinessPage();
  const [{ id }, query] = await Promise.all([params, searchParams]);

  const event = await getBusinessEvent(deps, business.id, id).catch((err: unknown) => {
    if (err instanceof ApiError && err.code === 'NOT_FOUND') notFound();
    throw err;
  });
  const pendingCount = await countPendingProposals(deps, business.id);

  return (
    <BusinessShell active="events" businessName={business.name} pendingCount={pendingCount}>
      <EventEditor
        event={event}
        defaultCategory={event.category}
        capacityCeiling={business.capabilities.capacity}
        startCancelling={query.cancel === '1'}
      />
    </BusinessShell>
  );
}
