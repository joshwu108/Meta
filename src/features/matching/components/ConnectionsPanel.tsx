'use client';
import { MessageCircle, UsersRound } from 'lucide-react';
import { useRef, useState } from 'react';
import { Avatar, Button, Card, EmptyState } from '@/features/core/components/ui';
import { useFocusFallback } from '@/lib/use-focus-fallback';
import type { ConnectionItem } from '../server/connections';
import { ChatSheet } from './ChatSheet';

/** Connections tab (P1): accepted connections with a polled 1:1 conversation. */
export function ConnectionsPanel({ connected }: { connected: ConnectionItem[] }) {
  const [chatWith, setChatWith] = useState<{ id: string; displayName: string } | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  useFocusFallback(listRef, chatWith?.id ?? '');
  if (connected.length === 0) {
    return (
      <Card>
        <EmptyState icon={<UsersRound size={22} strokeWidth={1.75} aria-hidden />} title="When someone accepts your request, you can message them here." />
      </Card>
    );
  }
  return (
    <Card as="section" aria-label="Your connections">
      <ul ref={listRef} tabIndex={-1} className="divide-y divide-border-subtle">
        {connected.map((item) => (
          <li key={item.id} className="flex min-h-[64px] items-center gap-3 py-2">
            <Avatar name={item.user.displayName} src={item.user.avatarUrl} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{item.user.displayName}</p>
              {item.user.neighborhood && <p className="truncate text-[length:var(--text-sm)] text-text-2">{item.user.neighborhood}</p>}
            </div>
            <Button variant="secondary" leadingIcon={<MessageCircle size={16} aria-hidden />} onClick={() => setChatWith({ id: item.id, displayName: item.user.displayName })}>
              Message
            </Button>
          </li>
        ))}
      </ul>
      <ChatSheet connection={chatWith} onClose={() => setChatWith(null)} />
    </Card>
  );
}
