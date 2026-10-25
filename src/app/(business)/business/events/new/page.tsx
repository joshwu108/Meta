import { EventEditor } from '@/features/business/components/EventEditor';
import { requireBusinessPage } from '@/features/business/server/page-data';

export const dynamic = 'force-dynamic';

/** Business Screen 4 — create. */
export default async function NewEventPage() {
  const { business } = await requireBusinessPage();

  return (
    <EventEditor
      defaultCategory={business.capabilities.eventCategories[0] ?? business.category}
      capacityCeiling={business.capabilities.capacity}
    />
  );
}
