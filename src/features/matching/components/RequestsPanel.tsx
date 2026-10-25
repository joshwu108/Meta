'use client';
import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import { Avatar, Button, Card, EmptyState, StatusPill } from '@/features/core/components/ui';
import type { ConnectionItem } from '../server/connections';

type Props = {
  incoming: ConnectionItem[];
  outgoing: ConnectionItem[];
  isPending: (key: string) => boolean;
  onAnswer: (item: ConnectionItem, status: 'accepted' | 'declined') => void;
};

function Row({ item, children }: { item: ConnectionItem; children: ReactNode }) {
  return (
    <li className="flex min-h-[64px] items-center gap-3 py-2">
      <Avatar name={item.user.displayName} src={item.user.avatarUrl} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{item.user.displayName}</p>
        <p className="truncate text-[length:var(--text-sm)] text-text-2">{item.message ?? item.user.neighborhood ?? 'Wants to connect'}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </li>
  );
}

/** Requests tab (Screen 3): incoming with Accept/Decline, outgoing with Pending. */
export function RequestsPanel({ incoming, outgoing, isPending, onAnswer }: Props) {
  if (incoming.length === 0 && outgoing.length === 0) {
    return (
      <Card>
        <EmptyState icon={<Inbox size={22} strokeWidth={1.75} aria-hidden />} title="No open requests. When someone wants to connect, it shows up here." />
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {incoming.length > 0 && (
        <Card as="section" aria-labelledby="incoming-heading">
          <h2 id="incoming-heading" className="text-[length:var(--text-md)]">
            Incoming
          </h2>
          <ul className="mt-1 divide-y divide-border-subtle">
            {incoming.map((item) => (
              <Row key={item.id} item={item}>
                <Button variant="secondary" isLoading={isPending(`decline:${item.id}`)} onClick={() => onAnswer(item, 'declined')}>
                  Decline
                </Button>
                <Button isLoading={isPending(`accept:${item.id}`)} onClick={() => onAnswer(item, 'accepted')}>
                  Accept
                </Button>
              </Row>
            ))}
          </ul>
        </Card>
      )}
      {outgoing.length > 0 && (
        <Card as="section" aria-labelledby="outgoing-heading">
          <h2 id="outgoing-heading" className="text-[length:var(--text-md)]">
            Sent
          </h2>
          <ul className="mt-1 divide-y divide-border-subtle">
            {outgoing.map((item) => (
              <Row key={item.id} item={item}>
                <StatusPill status="pending" />
              </Row>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
