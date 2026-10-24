'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { safeNext } from '@/lib/safe-next';
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

/** In-app deep link from `payload.href`, or null when absent or not a safe app path. */
export function notificationHref(item: NotificationRow): string | null {
  const href = safeNext(item.payload['href'], '');
  return href === '' ? null : href;
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

export type NotificationListProps = {
  items: NotificationRow[];
  onMarkRead: (id: string) => void | Promise<void>;
  /** Called when a row with a deep link is followed (the bell closes its popover). */
  onNavigate?: () => void;
};

const rowClass = 'flex w-full items-start gap-3 rounded-md px-2 py-2.5 text-left no-underline transition-colors duration-[var(--duration-fast)] hover:bg-hover hover:no-underline';

function RowContent({ item, isUnread }: { item: NotificationRow; isUnread: boolean }) {
  const body = notificationBody(item);
  return (
    <>
      <span aria-hidden className={cn('mt-2 h-2 w-2 shrink-0 rounded-pill', isUnread ? 'bg-brand' : 'bg-transparent')} />
      <span className="min-w-0 flex-1 text-text">
        <span className={cn('block truncate', isUnread ? 'font-semibold' : 'font-medium')}>{notificationTitle(item)}</span>
        {body && <span className="block truncate text-[length:var(--text-sm)] text-text-2">{body}</span>}
      </span>
      <span className="shrink-0 text-[length:var(--text-xs)] text-text-3">{relativeTime(item.created_at)}</span>
    </>
  );
}

/** Rows with `payload.href` navigate there (and mark read); others only mark read. */
export function NotificationList({ items, onMarkRead, onNavigate }: NotificationListProps) {
  const router = useRouter();
  return (
    <ul className="flex max-h-[60dvh] flex-col overflow-y-auto">
      {items.map((item) => {
        const isUnread = item.read_at === null;
        const href = notificationHref(item);
        const markRead = async () => {
          if (isUnread) await onMarkRead(item.id);
        };
        return (
          <li key={item.id}>
            {href ? (
              <Link
                href={href}
                onClick={(event) => {
                  // Mark read before navigating so the next page's server-rendered count is right.
                  event.preventDefault();
                  void markRead().finally(() => {
                    onNavigate?.();
                    router.push(href);
                  });
                }}
                className={cn(rowClass, isUnread && 'bg-brand-soft/40')}
              >
                <RowContent item={item} isUnread={isUnread} />
              </Link>
            ) : (
              <button type="button" onClick={() => void markRead()} className={cn(rowClass, isUnread && 'bg-brand-soft/40')}>
                <RowContent item={item} isUnread={isUnread} />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
