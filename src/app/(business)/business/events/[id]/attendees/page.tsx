import { notFound } from 'next/navigation';
import { Users } from 'lucide-react';
import { Card, CardHeader, CapacityMeter, EmptyState, StatusPill } from '@/features/core/components/ui';
import { ApiError } from '@/lib/api/errors';
import { BusinessShell } from '@/features/business/components/BusinessShell';
import { StatRow } from '@/features/business/components/StatRow';
import { formatDateTime } from '@/features/business/format';
import { STATUS_LABEL, STATUS_TONE } from '@/features/business/labels';
import { getBusinessEvent, getEventAttendees } from '@/features/business/server/events';
import { countPendingProposals } from '@/features/business/server/proposals';
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
  const [attendees, pendingCount] = await Promise.all([
    getEventAttendees(deps, business.id, id),
    countPendingProposals(deps, business.id),
  ]);

  const named = attendees.attendees.filter((a) => a.displayName !== null).length;

  return (
    <BusinessShell active="events" businessName={business.name} pendingCount={pendingCount}>
      <div className="flex flex-col gap-5">
        <header>
          <StatusPill tone={STATUS_TONE[event.status]}>{STATUS_LABEL[event.status]}</StatusPill>
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
              <EmptyState icon={<Users aria-hidden size={24} strokeWidth={1.75} />}>
                No confirmed attendees yet.
              </EmptyState>
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
    </BusinessShell>
  );
}
