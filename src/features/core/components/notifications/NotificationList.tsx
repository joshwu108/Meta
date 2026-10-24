'use client';
import type { NotificationRow } from '@/shared/schemas/notification';
import type { NotificationType } from '@/shared/enums';
import { cn } from '../ui/cn';

const TITLES: Record<NotificationType, string> = {
  connection_request: 'New connection request',
  connection_accepted: 'Connection accepted',
  group_invite: 'Group invitation',
  event_recommended: 'Event picked for you',
  event_published: 'New event nearby',
  rsvp_confirmed: 'RSVP confirmed',
  event_updated: 'Event updated',
  event_cancelled: 'Event cancelled',
  proposal_received: 'New event proposal',
  proposal_decided: 'Proposal decision',
  reconnect_suggestion: 'Reconnect suggestion',
};

/** Human title for a notification; payload.title overrides the type default. */
export function notificationTitle(item: NotificationRow): string {
  const custom = item.payload['title'];
  return typeof custom === 'string' && custom.length > 0 ? custom : TITLES[item.type];
}

export function notificationBody(item: NotificationRow): string | null {
  const body = item.payload['body'] ?? item.payload['message'];
  return typeof body === 'string' ? body : null;
}

export function relativeTime(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function NotificationList({ items, onMarkRead }: { items: NotificationRow[]; onMarkRead: (id: string) => void }) {
  return (
    <ul className="flex max-h-[60dvh] flex-col overflow-y-auto">
      {items.map((item) => {
        const isUnread = item.read_at === null;
        const body = notificationBody(item);
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => isUnread && onMarkRead(item.id)}
              className={cn('flex w-full items-start gap-3 rounded-md px-2 py-2.5 text-left transition-colors duration-[var(--duration-fast)] hover:bg-hover', isUnread && 'bg-brand-soft/40')}
            >
              <span aria-hidden className={cn('mt-2 h-2 w-2 shrink-0 rounded-pill', isUnread ? 'bg-brand' : 'bg-transparent')} />
              <span className="min-w-0 flex-1">
                <span className={cn('block truncate', isUnread ? 'font-semibold' : 'font-medium')}>{notificationTitle(item)}</span>
                {body && <span className="block truncate text-[length:var(--text-sm)] text-text-2">{body}</span>}
              </span>
              <span className="shrink-0 text-[length:var(--text-xs)] text-text-3">{relativeTime(item.created_at)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
