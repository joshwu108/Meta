import { notFound } from 'next/navigation';
import { Users } from 'lucide-react';
import { CapacityMeter, Card, CardHeader, EmptyState, StatusPill } from '@/features/core/components/ui';
import { ApiError } from '@/lib/api/errors';
import { StatRow } from '@/features/business/components/StatRow';
import { formatDateTime } from '@/features/business/format';
import { getBusinessEvent, getEventAttendees } from '@/features/business/server/events';
import { requireBusinessPage } from '@/features/business/server/page-data';

export const dynamic = 'force-dynamic';

/**
 * Business Screen 5 — attendees. Counts first, then the consented list; anyone who did not
 * consent appears as "Attendee (private)" and no user id is ever rendered
 * (spec sections 6 and 10, criterion 3).
 */
export default async function AttendeesPage({ params }: { params: Promise<{ id: string }> }) {
  const { deps, business } = await requireBusinessPage();
  const { id } = await params;

  const event = await getBusinessEvent(deps, business.id, id).catch((err: unknown) => {
    if (err instanceof ApiError && err.code === 'NOT_FOUND') notFound();
    throw err;
  });
  const [attendees] = await Promise.all([
    getEventAttendees(deps, business.id, id),
  ]);

  const named = attendees.attendees.filter((a) => a.displayName !== null).length;

  return (
    <div className="flex flex-col gap-5">
      <header>
        <StatusPill status={event.status} />
        <h1 className="mt-2 text-xl font-bold leading-tight">{event.title}</h1>
        <p className="mt-1 text-sm text-text-2">{formatDateTime(event.startsAt)}</p>
      </header>

      <StatRow
        items={[
          { label: 'Confirmed', value: attendees.confirmedCount },
          { label: 'Waitlisted', value: attendees.waitlistedCount },
          { label: 'Shared their name', value: named, hint: 'Only with your venue' },
        ]}
      />

      <Card>
        <CardHeader title="Capacity" />
        <CapacityMeter confirmed={attendees.confirmedCount} capacity={event.capacity} />
      </Card>

      <Card className="p-0">
        <div className="p-4">
          <CardHeader
            title="Who is coming"
            subtitle="Names appear only for attendees who chose to share them with you."
          />
        </div>
        {attendees.attendees.length === 0 ? (
          <div className="p-4 pt-0">
            <EmptyState icon={<Users aria-hidden size={24} strokeWidth={1.75} />} title="No confirmed attendees yet." />
          </div>
        ) : (
          <ul>
            {attendees.attendees.map((attendee, index) => (
              <li
                key={`${attendee.displayName ?? 'private'}-${index}`}
                className="flex min-h-14 items-center justify-between gap-3 border-t border-border-subtle px-4 py-3"
              >
                <span className={attendee.displayName ? 'font-medium' : 'text-text-2'}>
                  {attendee.displayName ?? 'Attendee (private)'}
                </span>
                {attendee.sharedInterests?.length ? (
                  <span className="truncate text-sm text-text-2">
                    {attendee.sharedInterests.join(', ')}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
