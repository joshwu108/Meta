import { CalendarPlus } from 'lucide-react';
import { Card, EmptyState } from '@/features/core/components/ui';
import { ButtonLink } from '@/features/business/components/form';
import { EventListRow } from '@/features/business/components/EventListRow';
import { EventsTable } from '@/features/business/components/EventsTable';
import { listBusinessEvents } from '@/features/business/server/events';
import { requireBusinessPage } from '@/features/business/server/page-data';

export const dynamic = 'force-dynamic';

/** Business Screen 5 — the events table. */
export default async function BusinessEventsPage() {
  const { deps, business } = await requireBusinessPage();
  const [events] = await Promise.all([
    listBusinessEvents(deps, business.id),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold leading-tight">Events</h1>
          <p className="mt-1 text-sm text-text-2">
            {events.length} {events.length === 1 ? 'event' : 'events'} in total
          </p>
        </div>
        <ButtonLink href="/business/events/new">
          <CalendarPlus aria-hidden size={20} strokeWidth={1.75} />
          New event
        </ButtonLink>
      </header>

      {events.length === 0 ? (
        <EmptyState
          icon={<CalendarPlus aria-hidden size={24} strokeWidth={1.75} />}
          action={
            <ButtonLink href="/business/events/new" variant="secondary">
              Create your first event
            </ButtonLink>
          }
          title="No events yet."
        />
      ) : (
        <Card className="p-0">
          {/* Same rows, two presentations: a stack to scroll on a phone, columns to compare
              on a desktop (design-system.md section 3). */}
          <ul className="xl:hidden">
            {events.map((event) => (
              <EventListRow key={event.id} event={event} />
            ))}
          </ul>
          {/* From 1280px, not 1024px: the table's columns need ~810px and a 1024px window
              leaves the business column only ~696px, which overflowed the page. */}
          <div className="hidden overflow-x-auto xl:block">
            <EventsTable events={events} />
          </div>
        </Card>
      )}
    </div>
  );
}
