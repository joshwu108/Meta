import { notFound } from 'next/navigation';
import { ApiError } from '@/lib/api/errors';
import { EventEditor } from '@/features/business/components/EventEditor';
import { getBusinessEvent } from '@/features/business/server/events';
import { requireBusinessPage } from '@/features/business/server/page-data';
import { isLookupId } from '@/features/business/server/lookup-id';

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
  // A mistyped or truncated URL is not-found, not a failure: Postgres rejects a malformed
  // uuid with 22P02, which the store can only report as an internal error.
  if (!isLookupId(id)) notFound();

  const event = await getBusinessEvent(deps, business.id, id).catch((err: unknown) => {
    if (err instanceof ApiError && err.code === 'NOT_FOUND') notFound();
    throw err;
  });

  return (
    <EventEditor
      event={event}
      defaultCategory={event.category}
      capacityCeiling={business.capabilities.capacity}
      startCancelling={query.cancel === '1'}
    />
  );
}
