'use client';
import { Bell, BellOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiPatch } from '@/lib/api/client';
import type { NotificationRow } from '@/shared/schemas/notification';
import { cn } from '../ui/cn';
import { EmptyState } from '../ui/EmptyState';
import { NotificationList } from './NotificationList';

type ListData = { items: NotificationRow[]; unreadCount: number };

/** Bell with unread badge; opens a popover listing notifications and marks them read on click. */
export function NotificationBell({ initialUnread = 0 }: { initialUnread?: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<NotificationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiGet<ListData>('/api/notifications?limit=20', { cache: 'no-store' });
      setItems(data.items);
      setUnread(data.unreadCount);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load notifications');
    }
  }, []);

  useEffect(() => {
    if (isOpen) void load();
  }, [isOpen, load]);

  useEffect(() => {
    if (!isOpen) return;
    const onClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setIsOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  const markRead = useCallback(async (id: string) => {
    let updated: NotificationRow;
    try {
      updated = await apiPatch<NotificationRow>(`/api/notifications/${id}/read`);
    } catch {
      return;
    }
    setItems((current) => current?.map((item) => (item.id === id ? updated : item)) ?? null);
    setUnread((current) => Math.max(0, current - 1));
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={() => setIsOpen((open) => !open)}
        data-testid="notification-bell"
        className={cn('relative inline-flex h-9 w-9 items-center justify-center rounded-pill bg-surface-2 text-text transition-colors duration-[var(--duration-fast)] hover:bg-hover active:bg-pressed', isOpen && 'bg-brand-soft text-brand-ink')}
      >
        <Bell size={20} strokeWidth={1.75} aria-hidden />
        {unread > 0 && (
          <span data-testid="notification-unread" className="absolute -top-1 -right-1 inline-flex h-5 min-w-5 items-center justify-center rounded-pill bg-danger px-1 text-[length:var(--text-xs)] font-bold text-text-on-brand">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {isOpen && (
        <div role="dialog" aria-label="Notifications" className="rise-in absolute right-0 top-11 z-50 w-[min(360px,calc(100vw-32px))] rounded-lg bg-surface p-2 shadow-[var(--shadow-3)]">
          <div className="flex items-center justify-between px-2 py-1">
            <h2 className="text-[length:var(--text-md)]">Notifications</h2>
            {unread > 0 && <span className="text-[length:var(--text-sm)] text-text-2">{unread} unread</span>}
          </div>
          {error ? (
            <EmptyState icon={<BellOff size={20} />} title={error} />
          ) : items === null ? (
            <p className="px-2 py-6 text-center text-[length:var(--text-sm)] text-text-2">Loading…</p>
          ) : items.length === 0 ? (
            <EmptyState icon={<BellOff size={20} />} title="You're all caught up" />
          ) : (
            <NotificationList items={items} onMarkRead={markRead} onNavigate={() => setIsOpen(false)} />
          )}
        </div>
      )}
    </div>
  );
}
