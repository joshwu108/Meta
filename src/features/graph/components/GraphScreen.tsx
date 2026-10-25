'use client';
import { Share2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { EmptyState, Tabs } from '@/features/core/components/ui';
import { useUrlTab } from '@/lib/use-url-tab';
import type { GraphNode, GraphSnapshot } from '../server/types';
import { GraphCanvas } from './GraphCanvas';
import { GraphLegend } from './GraphLegend';
import { GraphList } from './GraphList';
import { NodeDetailSheet } from './NodeDetailSheet';

export type GraphView = 'graph' | 'list';
const VIEWS: GraphView[] = ['graph', 'list'];

/**
 * `/graph`: the viewer's ego network. The `Graph` view draws it; the `List` view is the same
 * snapshot as rows, which is the keyboard and screen-reader path to every node.
 */
export function GraphScreen({ snapshot }: { snapshot: GraphSnapshot }) {
  const [view, setView] = useUrlTab(VIEWS, 'graph');
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [drawn, setDrawn] = useState(snapshot.nodes.length);
  const onDrawn = useCallback((count: number) => setDrawn(count), []);
  const { stats } = snapshot;
  const people = stats.connected + stats.forming + stats.suggested;
  const isEmpty = snapshot.nodes.length <= 1;

  const counts = [
    stats.connected > 0 && `${stats.connected} connected`,
    stats.forming > 0 && `${stats.forming} forming`,
    stats.groups > 0 && `${stats.groups} ${stats.groups === 1 ? 'group' : 'groups'}`,
    stats.events > 0 && `${stats.events} ${stats.events === 1 ? 'event' : 'events'}`,
  ].filter(Boolean) as string[];

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1>Your graph</h1>
        <p className="mt-1 text-[length:var(--text-sm)] text-text-2">
          {isEmpty
            ? 'Connections appear here as you make them and as your agent finds people for you.'
            : `${counts.join(' · ')}. Tap anyone to see how you’re connected.`}
        </p>
      </header>

      <div className="overflow-x-auto">
        <Tabs
          items={[
            { value: 'graph' as const, label: 'Graph' },
            { value: 'list' as const, label: 'List', count: people > 0 ? people : undefined },
          ]}
          value={view}
          onChange={setView}
          ariaLabel="Graph views"
        />
      </div>

      {isEmpty ? (
        <EmptyState
          icon={<Share2 size={22} strokeWidth={1.75} aria-hidden />}
          title="Nothing to draw yet. Connect with someone or join a group and they’ll show up here."
        />
      ) : view === 'graph' ? (
        <div className="flex flex-col gap-3">
          <GraphCanvas
            snapshot={snapshot}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
            onDrawn={onDrawn}
          />
          <GraphLegend stats={stats} drawn={drawn} total={snapshot.nodes.length} />
        </div>
      ) : (
        <GraphList snapshot={snapshot} />
      )}

      <NodeDetailSheet snapshot={snapshot} node={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
