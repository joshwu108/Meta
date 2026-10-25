import { CalendarDays, ChevronRight, Share2, UsersRound } from 'lucide-react';
import Link from 'next/link';
import { Card, EmptyState, StatusPill } from '@/features/core/components/ui';
import type { GroupEvent } from '../server/types';
import { formatEventTime } from '../labels';

function reason(item: GroupEvent): { icon: typeof UsersRound; text: string } {
  if (item.membersGoing > 0) return { icon: UsersRound, text: `${item.membersGoing} ${item.membersGoing === 1 ? 'member is' : 'members are'} going` };
  return { icon: Share2, text: 'Shared with the group' };
}

/** Events tab (Screen 5, AC5): upcoming events from 06's contracts, each opening its event page. */
export function EventsPanel({ events }: { events: GroupEvent[] }) {
  if (events.length === 0) {
    return (
      <Card>
        <EmptyState icon={<CalendarDays size={22} strokeWidth={1.75} aria-hidden />} title="No upcoming events yet. Share one from an event page, or RSVP and it shows up here." />
      </Card>
    );
  }
  return (
    <Card as="section" aria-label="Upcoming events">
      <ul className="flex flex-col">
        {events.map((item) => {
          const why = reason(item);
          return (
            <li key={item.event.id}>
              <Link href={`/events/${item.event.id}`} className="flex min-h-[72px] items-center gap-3 rounded-md px-2 py-3 text-text hover:bg-hover hover:no-underline">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">
                  <CalendarDays size={20} strokeWidth={1.75} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{item.event.title}</span>
                  <span className="block truncate text-[length:var(--text-sm)] text-text-2">
                    {formatEventTime(item.event.startsAt)} · {item.event.business.name}
                  </span>
                  <span className="mt-1 inline-flex items-center gap-1 text-[length:var(--text-xs)] text-text-2">
                    <why.icon size={12} aria-hidden /> {why.text}
                  </span>
                </span>
                {item.event.rsvpStatus && <StatusPill status={item.event.rsvpStatus} />}
                <ChevronRight size={20} className="shrink-0 text-text-3" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
