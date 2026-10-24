'use client';
import { EyeOff, MapPin, UsersRound, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button, Card, EmptyState, Tabs, useToast } from '@/features/core/components/ui';
import { useApiAction } from '@/lib/api/use-api-action';
import type { ReportReason } from '@/shared/schemas/social';
import type { ConnectionItem } from '../server/connections';
import type { MatchCard, MatchesStatus } from '../server/matches';
import { ConnectSheet } from './ConnectSheet';
import { ConnectionsPanel } from './ConnectionsPanel';
import { MatchCardView } from './MatchCardView';
import { MatchFilters, type MatchFilterState } from './MatchFilters';
import { RequestsPanel } from './RequestsPanel';
import { BlockSheet, ReportSheet, SafetyMenu } from './SafetyMenu';

export type MatchTab = 'recommended' | 'requests' | 'connections';
type Tab = MatchTab;
type Person = { id: string; displayName: string };

export type MatchScreenProps = {
  status: MatchesStatus;
  matches: MatchCard[];
  incoming: ConnectionItem[];
  outgoing: ConnectionItem[];
  connected: ConnectionItem[];
  filters: MatchFilterState;
  initialTab: Tab;
  /** Deep link from an agent suggestion card (`/match?focus=<userId>`): shown first. */
  focusId?: string;
};

const TAB_LABELS: Record<Tab, string> = {
  recommended: 'Recommended',
  requests: 'Requests',
  connections: 'Connections',
};

const linkButton =
  'inline-flex h-9 items-center justify-center rounded-md bg-brand px-4 font-semibold text-text-on-brand hover:bg-brand-hover hover:no-underline';

const EMPTY: Record<
  Exclude<MatchesStatus, 'ok'>,
  { icon: LucideIcon; title: string; href: string; cta: string }
> = {
  not_discoverable: {
    icon: EyeOff,
    title: 'Turn on matching in your agent permissions to see people near you.',
    href: '/agent/permissions',
    cta: 'Open permissions',
  },
  no_location: {
    icon: MapPin,
    title: 'Add your neighborhood so your agent can find people nearby.',
    href: '/agent/preferences',
    cta: 'Add your neighborhood',
  },
  no_candidates: {
    icon: UsersRound,
    title: 'No one nearby matches yet. Widening your travel radius usually helps.',
    href: '/agent/preferences',
    cta: 'Widen your radius',
  },
};

function EmptyMatches({
  status,
  filtered,
}: {
  status: Exclude<MatchesStatus, 'ok'>;
  filtered: boolean;
}) {
  const empty =
    filtered && status === 'no_candidates'
      ? {
          ...EMPTY.no_candidates,
          title: 'No matches for this filter.',
          href: '/match',
          cta: 'Clear filters',
        }
      : EMPTY[status];
  const Icon = empty.icon;
  return (
    <Card>
      <EmptyState
        icon={<Icon size={22} strokeWidth={1.75} aria-hidden />}
        title={empty.title}
        action={
          <Link href={empty.href} className={linkButton}>
            {empty.cta}
          </Link>
        }
      />
    </Card>
  );
}

/** State and mutations behind the match screen: connect, block, report, answer requests. */
function useMatchActions() {
  const { toast } = useToast();
  const { run, isPending } = useApiAction(toast);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [connectTo, setConnectTo] = useState<Person | null>(null);
  const [blockTarget, setBlockTarget] = useState<Person | null>(null);
  const [reportTarget, setReportTarget] = useState<Person | null>(null);
  const hide = (id: string) => setHidden((current) => new Set([...current, id]));

  const sendRequest = async (personId: string, message: string) => {
    const body = { recipientId: personId, ...(message ? { message } : {}) };
    const sent = await run(
      'connect',
      '/api/connections',
      { method: 'POST', body },
      { success: `Request sent to ${connectTo?.displayName ?? 'them'}` },
    );
    if (sent) {
      hide(personId);
      setConnectTo(null);
    }
  };
  const block = async (person: Person) => {
    if (
      await run(
        'block',
        `/api/users/${person.id}/block`,
        { method: 'POST' },
        { success: `${person.displayName} is blocked` },
      )
    ) {
      hide(person.id);
      setBlockTarget(null);
    }
  };
  const report = async (person: Person, reason: ReportReason, details: string) => {
    const body = { reason, ...(details ? { details } : {}) };
    if (
      await run(
        'report',
        `/api/users/${person.id}/report`,
        { method: 'POST', body },
        { success: 'Thanks. Your report was sent.', refresh: false },
      )
    )
      setReportTarget(null);
  };
  const answer = (item: ConnectionItem, status: 'accepted' | 'declined') =>
    run(
      `${status === 'accepted' ? 'accept' : 'decline'}:${item.id}`,
      `/api/connections/${item.id}`,
      { method: 'PATCH', body: { status } },
      {
        success:
          status === 'accepted'
            ? `You’re connected with ${item.user.displayName}`
            : 'Request declined',
      },
    );
  return {
    hidden,
    connectTo,
    setConnectTo,
    blockTarget,
    setBlockTarget,
    reportTarget,
    setReportTarget,
    sendRequest,
    block,
    report,
    answer,
    isPending,
  };
}

/** Screen 3 `/match`: Recommended people and connection requests. */
export function MatchScreen({
  status,
  matches,
  incoming,
  outgoing,
  connected,
  filters,
  initialTab,
  focusId,
}: MatchScreenProps) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const a = useMatchActions();
  const unhidden = matches.filter((match) => !a.hidden.has(match.user.id));
  const visible = focusId
    ? [...unhidden.filter((m) => m.user.id === focusId), ...unhidden.filter((m) => m.user.id !== focusId)]
    : unhidden;
  const isFocused = Boolean(focusId) && visible[0]?.user.id === focusId;
  const actionsFor = (match: MatchCard) => {
    const person = { id: match.user.id, displayName: match.user.displayName };
    return (
      <>
        <SafetyMenu person={person} onBlock={a.setBlockTarget} onReport={a.setReportTarget} />
        <Button onClick={() => a.setConnectTo(person)}>Connect</Button>
      </>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1>People you might click with</h1>
        <p className="mt-1 text-[length:var(--text-sm)] text-text-2">
          Scores reflect shared preferences, not a guarantee you’ll click.
        </p>
      </header>
      {/* The tab strip scrolls sideways on narrow screens instead of widening the page. */}
      <div className="overflow-x-auto">
        <Tabs
          items={[
            { value: 'recommended', label: 'Recommended' },
            {
              value: 'requests',
              label: 'Requests',
              count: incoming.length > 0 ? incoming.length : undefined,
            },
            {
              value: 'connections',
              label: 'Connections',
              count: connected.length > 0 ? connected.length : undefined,
            },
          ]}
          value={tab}
          onChange={setTab}
          ariaLabel="Match views"
        />
      </div>
      <div role="tabpanel" aria-label={TAB_LABELS[tab]} className="flex flex-col gap-3">
        {tab === 'connections' ? (
          <ConnectionsPanel connected={connected} />
        ) : tab === 'requests' ? (
          <RequestsPanel
            incoming={incoming}
            outgoing={outgoing}
            isPending={a.isPending}
            onAnswer={a.answer}
          />
        ) : (
          <>
            {status === 'ok' && <MatchFilters filters={filters} />}
            {status !== 'ok' || visible.length === 0 ? (
              <EmptyMatches
                status={status === 'ok' ? 'no_candidates' : status}
                filtered={Boolean(filters.interest || filters.goal)}
              />
            ) : (
              <ol className="feed-stagger flex flex-col gap-3" aria-label="Recommended people">
                {visible.map((match, index) => (
                  <li key={match.user.id}>
                    <MatchCardView
                      match={match}
                      variant={index === 0 ? 'lead' : 'compact'}
                      actions={actionsFor(match)}
                      leadLabel={isFocused ? 'Suggested by your agent' : undefined}
                    />
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>
      <ConnectSheet
        person={a.connectTo}
        isSending={a.isPending('connect')}
        onClose={() => a.setConnectTo(null)}
        onSend={a.sendRequest}
      />
      <BlockSheet
        person={a.blockTarget}
        isPending={a.isPending('block')}
        onClose={() => a.setBlockTarget(null)}
        onConfirm={a.block}
      />
      <ReportSheet
        person={a.reportTarget}
        isPending={a.isPending('report')}
        onClose={() => a.setReportTarget(null)}
        onSubmit={a.report}
      />
    </div>
  );
}
