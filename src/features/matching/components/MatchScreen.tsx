'use client';
import { Button, Tabs } from '@/features/core/components/ui';
import { useUrlTab } from '@/lib/use-url-tab';
import type { ConnectionItem } from '../server/connections';
import type { MatchCard, MatchesStatus } from '../server/matches';
import { ConnectSheet } from './ConnectSheet';
import { ConnectionsPanel } from './ConnectionsPanel';
import type { MatchFilterState } from './MatchFilters';
import { RecommendedPanel } from './RecommendedPanel';
import { RequestsPanel } from './RequestsPanel';
import { BlockSheet, ReportSheet, SafetyMenu } from './SafetyMenu';
import { useMatchActions } from './useMatchActions';

export type MatchTab = 'recommended' | 'requests' | 'connections';

export type MatchScreenProps = {
  status: MatchesStatus;
  matches: MatchCard[];
  incoming: ConnectionItem[];
  outgoing: ConnectionItem[];
  connected: ConnectionItem[];
  filters: MatchFilterState;
  /** Deep link from an agent suggestion card (`/match?focus=<userId>`): shown first. */
  focusId?: string;
};

const TAB_LABELS: Record<MatchTab, string> = { recommended: 'Recommended', requests: 'Requests', connections: 'Connections' };
const MATCH_TABS = Object.keys(TAB_LABELS) as MatchTab[];

const countOf = (items: readonly unknown[]) => (items.length > 0 ? items.length : undefined);

/** The focused person (if any) first, then everyone else in score order. */
function orderMatches(matches: readonly MatchCard[], hidden: ReadonlySet<string>, focusId?: string): MatchCard[] {
  const visible = matches.filter((match) => !hidden.has(match.user.id));
  if (!focusId) return visible;
  return [...visible.filter((m) => m.user.id === focusId), ...visible.filter((m) => m.user.id !== focusId)];
}

/** Screen 3 `/match`: recommended people, connection requests and (P1) connections; `?tab=` picks the view. */
export function MatchScreen({ status, matches, incoming, outgoing, connected, filters, focusId }: MatchScreenProps) {
  const [tab, setTab] = useUrlTab(MATCH_TABS, 'recommended');
  const a = useMatchActions();
  const visible = orderMatches(matches, a.hidden, focusId);
  const actionsFor = (match: MatchCard) => {
    const person = { id: match.user.id, displayName: match.user.displayName };
    return (
      <>
        <SafetyMenu person={person} onBlock={a.setBlockTarget} onReport={a.setReportTarget} />
        <Button onClick={() => a.setConnectTo(person)}>Connect</Button>
      </>
    );
  };
  const tabs = [
    { value: 'recommended' as const, label: 'Recommended' },
    { value: 'requests' as const, label: 'Requests', count: countOf(incoming) },
    { value: 'connections' as const, label: 'Connections', count: countOf(connected) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1>People you might click with</h1>
        <p className="mt-1 text-[length:var(--text-sm)] text-text-2">Scores reflect shared preferences, not a guarantee you’ll click.</p>
      </header>
      {/* The tab strip scrolls sideways on narrow screens instead of widening the page. */}
      <div className="overflow-x-auto">
        <Tabs items={tabs} value={tab} onChange={setTab} ariaLabel="Match views" />
      </div>
      <div role="tabpanel" aria-label={TAB_LABELS[tab]} className="flex flex-col gap-3">
        {tab === 'connections' && <ConnectionsPanel connected={connected} />}
        {tab === 'requests' && <RequestsPanel incoming={incoming} outgoing={outgoing} isPending={a.isPending} onAnswer={a.answer} />}
        {tab === 'recommended' && (
          <RecommendedPanel status={status} matches={visible} filters={filters} isFocused={Boolean(focusId) && visible[0]?.user.id === focusId} actionsFor={actionsFor} />
        )}
      </div>
      <ConnectSheet person={a.connectTo} isSending={a.isPending('connect')} onClose={() => a.setConnectTo(null)} onSend={a.sendRequest} />
      <BlockSheet person={a.blockTarget} isPending={a.isPending('block')} onClose={() => a.setBlockTarget(null)} onConfirm={a.block} />
      <ReportSheet person={a.reportTarget} isPending={a.isPending('report')} onClose={() => a.setReportTarget(null)} onSubmit={a.report} />
    </div>
  );
}
